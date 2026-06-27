// 登录/注册页
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (isRegister) await register(username, password);
      else await login(username, password);
      nav("/");
    } catch {
      setError(isRegister ? "注册失败（用户名可能已存在）" : "用户名或密码错误");
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h2>{isRegister ? "注册" : "登录"} 📝</h2>
      <form onSubmit={submit}>
        <input
          className="input"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
        />
        {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}
        <button style={{ width: "100%", padding: 8 }} type="submit">
          {isRegister ? "注册" : "登录"}
        </button>
      </form>
      <button
        style={{ marginTop: 8, background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
        onClick={() => setIsRegister((v) => !v)}
      >
        {isRegister ? "已有账号？去登录" : "没有账号？去注册"}
      </button>
    </div>
  );
}
