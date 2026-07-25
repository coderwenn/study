// 登录/注册页：Material Design 3 风格
// 参考 Lexis Notes 设计稿的布局/观感，适配本应用的「用户名 + 密码」登录与注册切换。
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotebookText, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // 密码明文切换
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false); // 防重复提交

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // 注册与登录共用同一套表单，按当前模式调用对应接口
      if (isRegister) await register(username, password);
      else await login(username, password);
      nav("/");
    } catch {
      setError(isRegister ? "注册失败（用户名可能已存在）" : "用户名或密码错误");
    } finally {
      setSubmitting(false);
    }
  }

  // 输入框公共样式：聚焦时主色边框 + 细 ring
  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface-raised text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px]">
        {/* 品牌区：图标 + 名称 + 副标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary rounded-lg mb-4 shadow-sm">
            <NotebookText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-on-surface tracking-tight mb-1">
            Notes Pro
          </h1>
          <p className="text-sm text-on-surface-variant">Personal Workspace</p>
        </div>

        {/* 登录卡片：白底 + 圆角 + 柔和投影 + 细边 */}
        <div
          className="bg-surface-raised rounded-xl p-8 md:p-10 border border-outline-variant/60"
          style={{ boxShadow: "0 12px 40px -12px rgba(0, 0, 0, 0.08)" }}
        >
          <form onSubmit={submit} className="space-y-6">
            {/* 用户名 */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-on-surface-variant mb-2"
              >
                用户名
              </label>
              <input
                id="username"
                className={inputClass}
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            {/* 密码：右侧带显示/隐藏切换 */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-on-surface-variant mb-2"
              >
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`${inputClass} pr-11`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant transition-colors"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="text-sm text-error bg-error/10 border border-error/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            {/* 提交按钮：主色 + 按压缩放 + 提交中禁用 */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-semibold py-3 px-4 rounded-lg shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
            >
              {submitting ? "处理中…" : isRegister ? "注册" : "登录"}
            </button>
          </form>
        </div>

        {/* 切换 登录 / 注册 */}
        <div className="text-center mt-4">
          <p className="text-sm text-on-surface-variant">
            {isRegister ? "已有账号？" : "没有账号？"}
            <button
              type="button"
              onClick={() => {
                setIsRegister((v) => !v);
                setError("");
              }}
              className="text-primary font-semibold hover:underline transition-all ml-1"
            >
              {isRegister ? "去登录" : "去注册"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
