// 设置弹窗：主题切换（亮色 / 暗色），含主题预览。
// 复用 ConfirmDialog 的交互模式（遮罩 + 居中卡片 + ESC 关闭 + 点遮罩关闭）。
// 预览效果：在弹窗内实时渲染一个迷你笔记界面缩略图，让用户切换前直观看到所选主题。
import { useEffect, useRef } from "react";
import { Sun, Moon, Check, X, FileText, Tag } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ThemeChoice = "light" | "dark";

export default function SettingsDialog({ open, onClose }: Props) {
  const { theme, setTheme } = useTheme();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ESC 关闭 + 打开时聚焦关闭按钮（避免误触）
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // 选项卡数据
  const choices: { value: ThemeChoice; label: string; desc: string; icon: typeof Sun }[] = [
    { value: "light", label: "亮色", desc: "经典浅色背景，适合白天使用", icon: Sun },
    { value: "dark", label: "暗色", desc: "深色背景护眼，适合夜间使用", icon: Moon },
  ];

  return (
    // 遮罩层：点击空白处关闭
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      {/* 卡片：阻止点击冒泡，避免误关闭 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[calc(100vw-2rem)] bg-surface-raised rounded-xl shadow-2xl p-6 border border-outline-variant/50"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-on-surface m-0">设置</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
            className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container-highest transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主题区块 */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider mb-3">
            外观
          </div>
          <div className="grid grid-cols-2 gap-3">
            {choices.map((c) => {
              const active = theme === c.value;
              const Icon = c.icon;
              return (
                <button
                  key={c.value}
                  onClick={() => setTheme(c.value)}
                  className={`relative flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                    active
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "border-outline-variant hover:border-primary/50 hover:bg-surface-container-highest"
                  }`}
                >
                  {/* 选中标记 */}
                  {active && (
                    <span className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-md ${
                      active ? "bg-primary/15 text-primary" : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-medium text-on-surface">{c.label}</span>
                  <span className="text-[11px] text-on-surface-muted leading-relaxed">{c.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 预览效果：实时展示当前主题下的迷你界面 */}
        <div className="mb-2">
          <div className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider mb-3">
            预览
          </div>
          <ThemePreview />
        </div>

        {/* 底栏：仅一个关闭按钮，主题切换即时生效 */}
        <div className="flex justify-end pt-4 mt-2 border-t border-outline-variant/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 主题预览：迷你笔记界面缩略图。
 * 因为整个应用已经 CSS 变量驱动，弹窗内组件会自动跟随主题，
 * 这里复用相同的语义色类名，呈现真实主题观感。
 */
function ThemePreview() {
  return (
    <div className="rounded-lg border border-outline-variant overflow-hidden">
      {/* 三栏缩略图 */}
      <div className="flex h-[140px]">
        {/* 左栏：品牌 + 标签 */}
        <div className="w-[80px] shrink-0 bg-surface-container-low p-2 flex flex-col gap-1.5 border-r border-outline-variant">
          <div className="text-[9px] font-bold text-primary">Notes Pro</div>
          <div className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] text-on-surface-variant">
            <FileText className="w-2.5 h-2.5" />
            <span>全部</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] text-on-surface-variant bg-surface-raised/60 border-l-2 border-primary">
            <Tag className="w-2.5 h-2.5" />
            <span>工作</span>
          </div>
        </div>

        {/* 中栏：笔记列表 */}
        <div className="w-[90px] shrink-0 bg-surface-raised p-1.5 flex flex-col gap-1 border-r border-outline-variant">
          <div className="h-3 bg-surface-container-highest rounded mb-1" />
          <div className="p-1 rounded bg-primary/5 border-l-2 border-primary">
            <div className="h-1.5 bg-on-surface/80 rounded w-full mb-1" />
            <div className="h-1 bg-on-surface-muted rounded w-2/3" />
          </div>
          <div className="p-1">
            <div className="h-1.5 bg-on-surface-variant rounded w-full mb-1" />
            <div className="h-1 bg-on-surface-muted rounded w-1/2" />
          </div>
        </div>

        {/* 右栏：编辑器 */}
        <div className="flex-1 bg-surface-raised p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1 pb-1 border-b border-outline-variant">
            <div className="h-2 bg-primary rounded w-12" />
            <div className="ml-auto h-3 w-8 bg-primary rounded text-[7px] text-white flex items-center justify-center">
              导出
            </div>
          </div>
          <div className="h-1.5 bg-on-surface rounded w-3/4" />
          <div className="h-1 bg-on-surface-variant rounded w-full" />
          <div className="h-1 bg-on-surface-variant rounded w-5/6" />
          <div className="h-1 bg-on-surface-variant rounded w-2/3" />
          {/* 标签药丸 */}
          <div className="flex gap-1 mt-1">
            <span className="px-1.5 py-0.5 text-[8px] bg-primary/10 text-primary rounded"># 工作</span>
            <span className="px-1.5 py-0.5 text-[8px] border border-outline-variant text-on-surface-variant rounded">
              + 添加
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
