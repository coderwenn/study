// 鉴权 Context：保存当前用户、登录/登出方法
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 启动时若有 token，尝试拉取当前用户
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .fetchMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  // 持久化 token 并设置当前用户；register 返回了 user，login 没有则再拉一次
  async function persist(pair: { access_token: string; refresh_token: string; user?: User }) {
    localStorage.setItem(ACCESS_TOKEN_KEY, pair.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, pair.refresh_token);
    setUser(pair.user ?? (await authApi.fetchMe()));
  }

  const login = async (username: string, password: string) =>
    persist(await authApi.login(username, password));
  const register = async (username: string, password: string) =>
    persist(await authApi.register(username, password));
  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
