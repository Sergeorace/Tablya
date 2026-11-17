'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, storage, AuthUserInfo } from './api';

interface AuthContextValue {
  user: AuthUserInfo | null;
  tenant: string | null;
  loading: boolean;
  login: (tenant: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [tenant, setTenant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(storage.user);
    setTenant(storage.tenant);
    setLoading(false);
  }, []);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const { data } = await api.post('/auth/login', { tenant: tenantSlug, email, password });
    storage.set(data.accessToken, data.refreshToken, data.user, tenantSlug);
    setUser(data.user);
    setTenant(tenantSlug);
  }, []);

  const logout = useCallback(() => {
    const refresh = storage.refresh;
    if (refresh) {
      // Best-effort : révocation côté serveur, sans bloquer la déconnexion locale.
      api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    }
    storage.clear();
    setUser(null);
    setTenant(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
