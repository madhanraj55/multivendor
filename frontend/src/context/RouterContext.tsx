import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface RouteState {
  path: string;
  query: Record<string, string>;
}

interface RouterContextValue {
  path: string;
  queryParams: Record<string, string>;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function parseLocation(): RouteState {
  const fullPath = window.location.pathname || '/';
  const search = window.location.search;
  const query: Record<string, string> = {};

  if (search) {
    const params = new URLSearchParams(search);
    params.forEach((value, key) => {
      query[key] = value;
    });
  }

  return {
    path: fullPath,
    query,
  };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteState>(() => parseLocation());

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    if (to === window.location.pathname + window.location.search) {
      return;
    }
    window.history.pushState(null, '', to);
    setRoute(parseLocation());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <RouterContext.Provider
      value={{
        path: route.path,
        queryParams: route.query,
        navigate,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return ctx;
}
