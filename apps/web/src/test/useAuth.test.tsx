// 验证：无 token 时 user 为空且 login 写入 token；logout 清空 react-query 缓存并移除 token
import { render, waitFor, fireEvent } from "@testing-library/react";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, test, expect } from "vitest";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import * as authApi from "../api/auth";

vi.mock("../api/auth");

// 每个用例独立的 queryClient + Provider 包裹（logout 现在依赖 useQueryClient）
function withProviders(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

// 探针：无用户时自动 login
function Probe() {
  const { user, loading, login } = useAuth();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!loading && !done) {
      setDone(true);
      if (!user) login("alice", "secret123");
    }
  }, [loading, user, done, login]);
  return <div>{user ? `logged:${user.username}` : loading ? "loading" : "empty"}</div>;
}

test("无 token 时 user 为空，login 成功后写入 token 并设置用户", async () => {
  (authApi.fetchMe as unknown as vi.Mock).mockResolvedValue({ id: 1, username: "alice" });
  (authApi.login as unknown as vi.Mock).mockResolvedValue({
    access_token: "AT",
    refresh_token: "RT",
    token_type: "bearer",
  });

  const qc = new QueryClient();
  const { getByText } = render(<Probe />, { wrapper: withProviders(qc) });

  await waitFor(() => expect(getByText("logged:alice")).toBeInTheDocument());
  expect(localStorage.getItem("notes_access_token")).toBe("AT");
});

// 探针：登录后提供「退出」按钮触发 logout
function LogoutProbe() {
  const { user, loading, login, logout } = useAuth();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!loading && !done) {
      setDone(true);
      if (!user) login("alice", "secret123");
    }
  }, [loading, user, done, login]);
  return (
    <div>
      <span>{user ? `logged:${user.username}` : "empty"}</span>
      <button onClick={logout}>退出</button>
    </div>
  );
}

test("logout 会清空 react-query 缓存并移除 token、置空用户", async () => {
  (authApi.fetchMe as unknown as vi.Mock).mockResolvedValue({ id: 1, username: "alice" });
  (authApi.login as unknown as vi.Mock).mockResolvedValue({
    access_token: "AT",
    refresh_token: "RT",
    token_type: "bearer",
  });

  const qc = new QueryClient();
  const { getByText } = render(<LogoutProbe />, { wrapper: withProviders(qc) });

  // 等待登录完成
  await waitFor(() => expect(getByText("logged:alice")).toBeInTheDocument());

  // 模拟用户使用过程中产生的缓存（笔记列表）
  qc.setQueryData(["notes", "list"], [{ id: 1, title: "x" }]);
  expect(qc.getQueryCache().getAll()).toHaveLength(1);

  // 点击退出
  fireEvent.click(getByText("退出"));

  // 缓存应被清空，避免下一个登录用户看到上个账号的数据
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
  // token 应被移除
  expect(localStorage.getItem("notes_access_token")).toBeNull();
  expect(localStorage.getItem("notes_refresh_token")).toBeNull();
  // 用户应已置空
  expect(getByText("empty")).toBeInTheDocument();
});
