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

## 测试

后端：`cd apps/api && uv run pytest`
前端：`cd apps/web && pnpm test -- --run`

## 目录

- `apps/api/` — FastAPI 后端（models / schemas / routers / services / auth）
- `apps/web/` — React + Vite 前端（api / hooks / components / pages）
- `docs/superpowers/specs/` — 设计文档（spec）
- `docs/superpowers/plans/` — 实施计划（plan）

## 配置

后端环境变量见 `apps/api/.env.example`（复制为 `.env` 后按需修改）。
