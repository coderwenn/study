import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 前端 /api 请求反代到后端，避免跨域
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
