// 登录/注册页：Lumina 设计语言
// 柔光渐变背景 + 玻璃质感卡片 + 聚焦发光输入 + 主色渐变按钮浮起动效。
// 适配本应用的「用户名 + 密码」登录与注册切换。
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotebookText, Eye, EyeOff, AlertCircle } from "lucide-react";
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

  // 输入框公共样式：聚焦时主色边框 + 柔和发光环
  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface-raised text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-glow transition-all duration-200 ease-out-expo";

  return (
    // 柔光渐变背景：从极浅靛蓝到纯净灰，营造安静的工作台氛围
    <div className="min-h-screen bg-gradient-to-br from-primary-soft via-surface to-surface-container-low flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* 背景装饰光斑：增加层次感，不抢内容 */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-primary-light/8 blur-3xl" />

      <div className="w-full max-w-[440px] relative animate-slide-up">
        {/* 品牌区：图标发光 + 名称 + 副标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark mb-4 shadow-glow-primary">
            <NotebookText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight mb-1">
            Notes Pro
          </h1>
          <p className="text-sm text-on-surface-variant">Personal Workspace</p>
        </div>

        {/* 登录卡片：玻璃质感 + 柔和多层投影 + 细边 */}
        <div className="bg-surface-raised rounded-2xl p-8 md:p-10 border border-outline-variant/60 shadow-soft-lg">
          <form onSubmit={submit} className="space-y-5">
            {/* 用户名 */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wide"
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
                className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wide"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface-variant transition-colors duration-200 p-1 rounded-md hover:bg-surface-hover"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 错误提示：柔和红色背景 + 图标 */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-error bg-error/8 border border-error/20 rounded-lg px-3 py-2.5 animate-slide-down">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 提交按钮：主色渐变 + 悬停浮起 + 发光 + 按压缩放 */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-br from-primary to-primary-dark hover:shadow-glow-primary text-white text-sm font-semibold py-3 px-4 rounded-lg shadow-soft transition-all duration-200 ease-out-expo hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-soft disabled:active:scale-100"
            >
              {submitting ? "处理中…" : isRegister ? "注册" : "登录"}
            </button>
          </form>
        </div>

        {/* 切换 登录 / 注册 */}
        <div className="text-center mt-5">
          <p className="text-sm text-on-surface-variant">
            {isRegister ? "已有账号？" : "没有账号？"}
            <button
              type="button"
              onClick={() => {
                setIsRegister((v) => !v);
                setError("");
              }}
              className="text-primary font-semibold hover:text-primary-dark transition-colors duration-200 ml-1"
            >
              {isRegister ? "去登录" : "去注册"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
