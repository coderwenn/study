// 受保护路由：未登录跳转 /login
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { ReactNode } from "react";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: "2rem" }}>加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
