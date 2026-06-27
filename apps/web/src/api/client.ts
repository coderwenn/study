// 统一 axios 实例：自动注入 token、401 时尝试 refresh、失败跳登录
import axios from "axios";

export const ACCESS_TOKEN_KEY = "notes_access_token";
export const REFRESH_TOKEN_KEY = "notes_refresh_token";

const api = axios.create({ baseURL: "" }); // 走 Vite /api 反代

// 请求拦截：自动带 access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截：401 尝试用 refresh 换新 token，失败则清除并跳登录
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url.includes("/auth/")
    ) {
      original._retry = true;
      const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (refresh) {
        try {
          const { data } = await axios.post("/api/auth/refresh", { refresh_token: refresh });
          localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original); // 重放原请求
        } catch {
          // refresh 也失败：清理登录态
        }
      }
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
