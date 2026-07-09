import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/**
 * Tailwind 配置 —— Lumina 设计语言
 *
 * 设计理念：以靛蓝紫为主色，搭配纯净中性表面层与多层柔和投影，
 * 营造优雅、有质感、层次分明的现代笔记工作台。
 * 保留 Material Design 3 的语义命名（surface / on-surface / outline 等），
 * 确保与现有组件兼容，仅升级色值与视觉表达。
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── 主色系：靛蓝紫（现代、专业、有质感）──────────────────
        primary: "#6366f1", // 主色 indigo-500
        "primary-dark": "#4f46e5", // 深色 indigo-600（hover）
        "primary-light": "#818cf8", // 浅色 indigo-400
        "primary-soft": "#eef2ff", // 极浅靛蓝（高亮背景 / 选中态）

        // ── 表面层：纯净中性灰，保留语义命名 ──────────────────────
        surface: "#fafafa", // 全局主背景
        "surface-container-low": "#f4f4f5", // 次级表面（侧栏底色）
        "surface-container-highest": "#e4e4e7", // 最高表面（悬停态）
        "surface-raised": "#ffffff", // 抬升表面（卡片 / 弹窗）
        "surface-hover": "#f4f4f5", // 悬停表面（列表项）

        // ── 文字 ────────────────────────────────────────────────
        "on-surface": "#18181b", // 主文字（接近黑，高对比）
        "on-surface-variant": "#52525b", // 次级文字
        "on-surface-muted": "#a1a1aa", // 弱化文字（占位 / 辅助）

        // ── 边框 ────────────────────────────────────────────────
        outline: "#a1a1aa", // 标准边框 / 图标色
        "outline-variant": "#e4e4e7", // 浅边框（分隔线）

        // ── 语义色 ──────────────────────────────────────────────
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        // 多层柔和投影：营造悬浮质感
        "soft-sm": "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        soft: "0 2px 8px -2px rgb(0 0 0 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.04)",
        "soft-md": "0 4px 16px -4px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.05)",
        "soft-lg": "0 12px 32px -8px rgb(0 0 0 / 0.12), 0 4px 12px -4px rgb(0 0 0 / 0.06)",
        "soft-xl": "0 24px 48px -12px rgb(0 0 0 / 0.16)",
        // 聚焦发光环（替代生硬的 ring）
        glow: "0 0 0 3px rgb(99 102 241 / 0.12)",
        "glow-error": "0 0 0 3px rgb(239 68 68 / 0.12)",
        // 主色按钮发光（hover 时强化主色氛围）
        "glow-primary": "0 8px 20px -6px rgb(99 102 241 / 0.45)",
      },
      transitionTimingFunction: {
        // 优雅的弹出曲线（Material emphasized decelerate）
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        // 轻微回弹（按钮按压释放）
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        200: "200ms",
        300: "300ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slide-down 300ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [forms, typography],
};
