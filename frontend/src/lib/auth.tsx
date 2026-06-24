import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken } from './api';

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  preferred_lang: string;
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  prefers_dark: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setUser: (u: User) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = (): AuthCtx => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function applyUser(u: User): void {
    setUserState(u);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api<{ user: User }>('/auth/me');
        if (!cancelled && user) applyUser(user);
      } catch {
        /* no/invalid token — stay logged out */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const { token, user } = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    setToken(token);
    applyUser(user);
  }

  function logout(): void {
    setToken(null);
    setUserState(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login, setUser: applyUser, logout }}>
      {children}
    </Ctx.Provider>
  );
}
