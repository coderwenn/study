import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/** Tailwind 配置：主题色板与设计稿一一对应（Material Design 3 风格浅色方案） */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        "primary-dark": "#1d4ed8",
        surface: "#faf8ff",
        "surface-container-low": "#f3f3fe",
        "surface-container-highest": "#e2e2ee",
        "on-surface": "#1a1b1f",
        "on-surface-variant": "#44474e",
        outline: "#74777f",
        "outline-variant": "#c4c6d0",
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
