import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/**
 * Tailwind 配置：主题色板通过 CSS 变量驱动。
 * 所有颜色引用 rgb(var(--xxx) / <alpha-value>)，亮/暗主题在 index.css 中
 * 通过 :root 与 .dark 重定义变量值即可全局切换，无需在每个组件加 dark: 前缀。
 *
 * 设计语言：Lumina（Material Design 3 风格），亮色保持原配色，
 * 暗色为 MD3 Dark 方案：深底 + 浅文字 + 主色提亮以保证对比度。
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 主色（亮色：蓝；暗色：亮蓝，提高暗背景对比度）
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-dark": "rgb(var(--color-primary-dark) / <alpha-value>)",

        // 表面层级（从浅到深）：底色 → 容器低 → 容器高 → 卡片
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-container-low": "rgb(var(--color-surface-container-low) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--color-surface-container-highest) / <alpha-value>)",
        "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
        "surface-hover": "rgb(var(--color-surface-hover) / <alpha-value>)",

        // 文字三级：主 / 次要 / 弱化
        "on-surface": "rgb(var(--color-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--color-on-surface-variant) / <alpha-value>)",
        "on-surface-muted": "rgb(var(--color-on-surface-muted) / <alpha-value>)",

        // 描边
        outline: "rgb(var(--color-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--color-outline-variant) / <alpha-value>)",

        // 语义色
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        md: "8px",
      },
    },
  },
  plugins: [forms, typography],
};
