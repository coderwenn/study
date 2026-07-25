// 应用根：ThemeProvider + Auth Provider + 路由
// ThemeProvider 在最外层，确保任何页面（含 LoginPage）都跟随主题
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import RequireAuth from "./components/RequireAuth";
import LoginPage from "./pages/LoginPage";
import NotesPage from "./pages/NotesPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <NotesPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
