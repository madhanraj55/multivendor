import type { AuthSession, AuthTokenResponse } from '../types/index.ts';

const SESSION_STORAGE_KEY = 'bharatbazaar_auth_session';

export class ApiError extends Error {
  statusCode: number;
  error?: string;
  messages: string[];

  constructor(statusCode: number, message: string | string[], error?: string) {
    const primaryMessage = Array.isArray(message) ? message[0] || 'An error occurred' : message;
    super(primaryMessage);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.error = error;
    this.messages = Array.isArray(message) ? message : [message];
  }
}

type AuthStateListener = (session: AuthSession | null) => void;

class SessionManager {
  private session: AuthSession | null = null;
  private listeners: Set<AuthStateListener> = new Set();

  constructor() {
    this.loadSession();
    // Synchronize token rotations across browser tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === SESSION_STORAGE_KEY) {
          this.loadSession();
        }
      });
    }
  }

  private loadSession(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        this.session = JSON.parse(raw);
      } else {
        this.session = null;
      }
      this.notify();
    } catch {
      this.session = null;
      this.notify();
    }
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  getRefreshToken(): string | null {
    return this.session?.refreshToken ?? null;
  }

  setSession(session: AuthSession): void {
    this.session = session;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage quota or privacy restriction fallback
    }
    this.notify();
  }

  updateTokens(tokens: { accessToken: string; refreshToken: string }): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session));
    } catch {
      // Storage quota fallback
    }
    this.notify();
  }

  clearSession(): void {
    this.session = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Cleanup fallback
    }
    this.notify();
  }

  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    listener(this.session);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }
}

export const sessionManager = new SessionManager();

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  _retry?: boolean;
}

class ApiClient {
  private baseUrl: string; 
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    const rawUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:3000/api/v1';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${normalizedEndpoint}`;

    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Attach access token unless explicitly skipped
    if (!options.skipAuth) {
      const accessToken = sessionManager.getAccessToken();
      if (accessToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError) {
      throw new ApiError(
        0,
        networkError instanceof Error ? networkError.message : 'Network connection failed',
        'NETWORK_ERROR',
      );
    }

    // Handle 401 Unauthorized for token refresh
    const isAuthEndpoint =
      normalizedEndpoint.startsWith('/auth/login') ||
      normalizedEndpoint.startsWith('/auth/register') ||
      normalizedEndpoint.startsWith('/auth/refresh') ||
      normalizedEndpoint.startsWith('/auth/verify-email');

    if (response.status === 401 && !options.skipAuth && !options._retry && !isAuthEndpoint) {
      const refreshedToken = await this.acquireRefreshedAccessToken();
      if (refreshedToken) {
        // Retry the original request with the new access token
        return this.request<T>(endpoint, {
          ...options,
          _retry: true,
          headers: {
            ...Object.fromEntries(headers.entries()),
            Authorization: `Bearer ${refreshedToken}`,
          },
        });
      }
    }

    // Parse JSON or error body
    const contentType = response.headers.get('content-type') || '';
    let parsedBody: unknown;

    if (contentType.includes('application/json')) {
      try {
        parsedBody = await response.json();
      } catch {
        parsedBody = null;
      }
    } else {
      try {
        parsedBody = await response.text();
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      let message: string | string[] = response.statusText || 'Request failed';
      let error: string | undefined;

      if (parsedBody && typeof parsedBody === 'object') {
        const bodyObj = parsedBody as Record<string, unknown>;
        if (typeof bodyObj.message === 'string' || Array.isArray(bodyObj.message)) {
          message = bodyObj.message as string | string[];
        }
        if (typeof bodyObj.error === 'string') {
          error = bodyObj.error;
        }
      } else if (typeof parsedBody === 'string' && parsedBody.trim()) {
        message = parsedBody;
      }

      throw new ApiError(response.status, message, error);
    }

    return parsedBody as T;
  }

  /**
   * Coordinated in-flight token refresh mutex.
   * Prevents multiple concurrent refresh calls in the same tab.
   * Distinguishes refresh failure from regular 401 authorization errors.
   */
  private async acquireRefreshedAccessToken(): Promise<string | null> {
    const refreshToken = sessionManager.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    // If a refresh is already in-flight, await the shared promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshUrl = `${this.baseUrl}/auth/refresh`;
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          // The refresh token itself is invalid, revoked, or expired.
          // Only here do we clear the stored session.
          sessionManager.clearSession();
          return null;
        }

        const data: AuthTokenResponse = await res.json();
        sessionManager.setSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        });

        return data.accessToken;
      } catch {
        // Transient network failure during refresh: do not eagerly wipe session
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }
}

export const apiClient = new ApiClient();
