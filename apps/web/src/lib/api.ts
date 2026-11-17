import axios from 'axios';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'tablya_token';
const REFRESH_KEY = 'tablya_refresh';
const USER_KEY = 'tablya_user';
const TENANT_KEY = 'tablya_tenant';

export const storage = {
  get token() { return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY); },
  get refresh() { return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY); },
  get user() {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUserInfo) : null;
  },
  get tenant() { return typeof window === 'undefined' ? null : localStorage.getItem(TENANT_KEY); },
  set(token: string, refresh: string, user: AuthUserInfo, tenant: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TENANT_KEY, tenant);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
  },
};

export interface AuthUserInfo {
  id: string;
  email: string | null;
  role: string;
  etablissement: string;
  permissions: string[];
}

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

api.interceptors.request.use((config) => {
  const token = storage.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      storage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
