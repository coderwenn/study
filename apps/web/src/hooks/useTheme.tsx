// 主题 Context：管理 light / dark 主题，持久化到 localStorage，
// 首次访问跟随系统偏好（prefers-color-scheme），切换通过给 <html> 加 .dark 类生效。
// CSS 变量驱动：tailwind.config.js 中所有颜色都引用 rgb(var(--xxx))，
// 切换 .dark 时只需在 :root / .dark 重定义变量，无需在组件里到处加 dark: 前缀。
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const THEME_KEY = "notes-theme";

const ThemeContext = createContext<ThemeState>({} as ThemeState);

// 读取初始主题：localStorage > 系统偏好 > light
function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // 跟随系统
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

// 把主题应用到 <html>：加 / 移除 .dark 类
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  // 启动时同步一次到 <html>
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 监听系统主题变化：仅当用户未显式选择时跟随
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // 用户未手动选择过主题时，跟随系统
      if (!localStorage.getItem(THEME_KEY)) {
        setThemeState(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
