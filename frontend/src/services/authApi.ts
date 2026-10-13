import { apiClient, sessionManager } from './apiClient.ts';
import type {
  RegisterPayload,
  RegisterResponse,
  LoginPayload,
  AuthTokenResponse,
  VerifyEmailPayload,
  RefreshTokenPayload,
  AuthUser,
  UpdateProfilePayload,
  ChangePasswordPayload,
} from '../types/index.ts';

export const authApi = {
  /**
   * POST /api/v1/auth/register
   * Creates a new customer or seller account.
   */
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    return apiClient.request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /**
   * POST /api/v1/auth/verify-email
   * Verifies account using the 32-byte hex token.
   */
  async verifyEmail(payload: VerifyEmailPayload): Promise<{ message: string }> {
    return apiClient.request<{ message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /**
   * POST /api/v1/auth/login
   * Authenticates user and returns accessToken, refreshToken, and user profile.
   */
  async login(payload: LoginPayload): Promise<AuthTokenResponse> {
    const response = await apiClient.request<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });

    sessionManager.setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    });

    return response;
  },

  /**
   * POST /api/v1/auth/refresh
   * Rotates session tokens and returns a fresh access and refresh token.
   */
  async refreshToken(payload: RefreshTokenPayload): Promise<AuthTokenResponse> {
    const response = await apiClient.request<AuthTokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });

    sessionManager.setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    });

    return response;
  },

  /**
   * POST /api/v1/auth/logout
   * Revokes the active session on the backend and clears frontend tokens.
   */
  async logout(): Promise<{ message: string }> {
    try {
      const response = await apiClient.request<{ message: string }>('/auth/logout', {
        method: 'POST',
      });
      return response;
    } finally {
      sessionManager.clearSession();
    }
  },

  /**
   * GET /api/v1/auth/me
   * Fetches the current authenticated user's profile.
   */
  async getCurrentUser(): Promise<AuthUser> {
    return apiClient.request<AuthUser>('/auth/me', {
      method: 'GET',
    });
  },

  /**
   * PATCH /api/v1/auth/profile
   * Updates profile fields (firstName, lastName, phone).
   */
  async updateProfile(payload: UpdateProfilePayload): Promise<{ message: string; user: AuthUser }> {
    const response = await apiClient.request<{ message: string; user: AuthUser }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const currentSession = sessionManager.getSession();
    if (currentSession) {
      sessionManager.setSession({
        ...currentSession,
        user: response.user,
      });
    }

    return response;
  },

  /**
   * POST /api/v1/auth/change-password
   * Changes account password and revokes existing sessions.
   */
  async changePassword(payload: ChangePasswordPayload): Promise<{ message: string }> {
    return apiClient.request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
