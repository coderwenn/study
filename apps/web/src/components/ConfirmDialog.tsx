// 通用确认弹窗：Material Design 3 风格（遮罩 + 居中卡片）。
// 可复用于「退出登录」「删除确认」等需要二次确认的场景。
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean; // 是否显示
  title: string; // 标题
  message?: ReactNode; // 正文（字符串或任意节点）
  confirmText?: string; // 确认按钮文字，默认「确认」
  cancelText?: string; // 取消按钮文字，默认「取消」
  danger?: boolean; // 危险操作（确认按钮变红）
  onConfirm: () => void; // 点击确认
  onCancel: () => void; // 点击取消 / 关闭（ESC、点遮罩）
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  // 取消按钮引用：打开时自动聚焦，避免误触确认
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    // ESC 键关闭
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    // 遮罩层：点击空白处视为取消
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      {/* 卡片：阻止点击冒泡到遮罩，避免点卡片内部误关闭 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] max-w-[calc(100vw-2rem)] bg-surface-raised rounded-xl shadow-2xl p-6 border border-outline-variant/50"
      >
        <h2 className="text-base font-semibold text-on-surface m-0 mb-2">{title}</h2>
        {message && (
          <div className="text-sm text-on-surface-variant mb-6 leading-relaxed">{message}</div>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-medium rounded-md text-on-surface-variant hover:bg-surface-container-highest transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={
              danger
                ? "px-4 py-1.5 text-sm font-medium rounded-md text-white bg-error hover:bg-error/90 transition-colors"
                : "px-4 py-1.5 text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark transition-colors"
            }
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
