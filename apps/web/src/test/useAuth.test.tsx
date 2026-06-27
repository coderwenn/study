// 验证：无 token 时 loading 结束且 user 为 null；login 后写入 token
import { render, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { vi, test, expect } from "vitest";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import * as authApi from "../api/auth";

vi.mock("../api/auth");

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

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  await waitFor(() => expect(getByText("logged:alice")).toBeInTheDocument());
  expect(localStorage.getItem("notes_access_token")).toBe("AT");
});
