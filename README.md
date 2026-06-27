# 笔记网站 (Notes App)

Monorepo：`apps/web`（React+Vite）+ `apps/api`（FastAPI）。

## 开发

```bash
# 一次性安装前端依赖
pnpm install
# 后端依赖（uv）
cd apps/api && uv sync && cd ../..

# 同时启动前后端
pnpm dev
```

前端 http://localhost:5173，后端 http://localhost:8000，API 文档 http://localhost:8000/docs。
