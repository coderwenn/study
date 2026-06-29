# 笔记网站 (Notes App)

Monorepo：`apps/web`（React+Vite）+ `apps/api`（FastAPI）。

## 开发

```bash
# 一次性安装依赖
pnpm install                          # 前端（monorepo 根目录）
cd apps/api && uv sync && cd ../..    # 后端（uv）
```

在**仓库根目录**执行下面这条，它会用 `concurrently` 同时拉起前端与后端：

```bash
pnpm dev      # 同时跑 dev:api（uvicorn:8000）+ dev:web（vite:5173）
```

- 前端：http://localhost:5173
- 后端：http://localhost:8000，API 文档 http://localhost:8000/docs

> 前端 dev server 通过 [vite.config.ts](apps/web/vite.config.ts) 把 `/api/*` 反代到 `http://localhost:8000`。**后端没启动时，Vite 代理会向浏览器返回 HTTP 500**（注意不是 502），所以一旦看到 `/api/*` 全部报 500，先确认是否在根目录跑了 `pnpm dev` 把后端也带起来了，而不是只单独跑了 `apps/web`。

### 排错：前端调 `/api` 报 500

- **多半是后端没起**。确认：`lsof -nP -iTCP:8000 -sTCP:LISTEN` 看不到进程即未启动。
- 单独起后端：`cd apps/api && uv run uvicorn app.main:app --reload --port 8000`。
- 端口被占（`address already in use`）：`lsof -nP -iTCP:8000` 找到占用进程，`kill <PID>` 后再起。

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
