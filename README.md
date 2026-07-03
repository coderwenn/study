# 笔记网站 (Notes App)

一个支持 Markdown、全文搜索与标签管理的个人笔记应用。Monorepo 结构:`apps/web`(React + Vite) + `apps/api`(FastAPI)。

## 功能特性

- **用户鉴权**:注册 / 登录 / 刷新令牌(JWT,access + refresh token 双令牌)
- **笔记 CRUD**:创建、编辑、删除、查看;数据按用户隔离,互相不可见
- **全文搜索**:基于 SQLite FTS5(trigram 分词),标题与正文检索;短关键词自动回退 LIKE 子串匹配
- **标签管理**:增、删、查(含每标签笔记计数);笔记可多标签,并按标签过滤
- **Markdown 编辑器**:分屏实时预览、顶部常驻工具栏、原生选区编辑通道(加粗 / 斜体 / 链接 / 图片 / 代码等)、快捷键(`⌘S` 保存等)、插入图片
- **分页列表**:列表项含摘要,支持分页

## 技术栈

| | 选型 |
| --- | --- |
| 后端 | FastAPI · SQLAlchemy 2.0 · SQLite (FTS5) · PyJWT · pydantic-settings |
| 前端 | React 18 · Vite · TypeScript · Tailwind CSS · TanStack Query · react-markdown |
| 部署 | Docker Compose:Caddy(静态前端 + `/api` 反代 + HTTPS)· uvicorn · SQLite(挂卷)· Open WebUI |

## 开发

```bash
# 一次性安装依赖
pnpm install                          # 前端(monorepo 根目录)
cd apps/api && uv sync && cd ../..    # 后端(uv)
```

在**仓库根目录**执行下面这条,它会用 `concurrently` 同时拉起前端与后端:

```bash
pnpm dev      # 同时跑 dev:api(uvicorn:8000)+ dev:web(vite:5173)
```

- 前端:http://localhost:5173
- 后端:http://localhost:8000,API 文档 http://localhost:8000/docs

> 前端 dev server 通过 [vite.config.ts](apps/web/vite.config.ts) 把 `/api/*` 反代到 `http://localhost:8000`。**后端没启动时,Vite 代理会向浏览器返回 HTTP 500**(注意不是 502),所以一旦看到 `/api/*` 全部报 500,先确认是否在根目录跑了 `pnpm dev` 把后端也带起来了,而不是只单独跑了 `apps/web`。

### 排错:前端调 `/api` 报 500

- **多半是后端没起**。确认:`lsof -nP -iTCP:8000 -sTCP:LISTEN` 看不到进程即未启动。
- 单独起后端:`cd apps/api && uv run uvicorn app.main:app --reload --port 8000`。
- 端口被占(`address already in use`):`lsof -nP -iTCP:8000` 找到占用进程,`kill <PID>` 后再起。

## 测试

```bash
# 后端(pytest + httpx)
cd apps/api && uv run pytest

# 前端(vitest + Testing Library)
cd apps/web && pnpm test -- --run
```

## 部署

生产部署使用 [docker-compose.yml](docker-compose.yml):Caddy 负责静态前端、`/api` 反代与 HTTPS,后端跑 uvicorn,SQLite 挂卷持久化,另含 Open WebUI 作为 AI 聊天界面。

完整步骤(服务器初始化、密钥配置、HTTPS 证书 DNS-01 签发、数据备份等)见 [docs/deploy.md](docs/deploy.md)。快速启动:

```bash
cp .env.example .env
# 填入 SECRET_KEY(openssl rand -hex 32)与 HERMES_API_KEY
docker compose up -d --build
```

## 目录

```
apps/api/   FastAPI 后端
  ├─ app/models/      ORM 模型(note / tag / user)
  ├─ app/schemas/     Pydantic 入参出参
  ├─ app/routers/     路由(auth / notes / tags)
  ├─ app/services/    业务逻辑(note / tag / search 全文搜索)
  └─ app/auth/        JWT 与鉴权依赖
apps/web/   React + Vite 前端
  ├─ src/api/         axios 请求封装(auth / notes / tags)
  ├─ src/hooks/       useAuth / useNotes / useTags
  ├─ src/components/  NoteList / NoteEditor / EditorToolbar / MarkdownSplit / Sidebar / TagPicker …
  ├─ src/editor/      Markdown 命令 / 选区编辑 / 快捷键
  └─ src/pages/       LoginPage / NotesPage
deploy/    Caddy 镜像与 Caddyfile
docs/      设计文档(specs)、实施计划(plans)、部署指南(deploy.md)
```

## 配置

- **后端**:环境变量见 [apps/api/.env.example](apps/api/.env.example)(复制为 `apps/api/.env` 后按需修改),含 `DATABASE_URL`、`SECRET_KEY`、token 有效期等。
- **部署**:根目录 [.env.example](.env.example) 提供 `SECRET_KEY`(JWT 签名)与 `HERMES_API_KEY`(Open WebUI 连接 AI 后端),`docker-compose` 会自动读取同目录的 `.env`。

> `SECRET_KEY` 在生产环境务必改成随机串:`openssl rand -hex 32`。`.env` 已在 `.gitignore`,不要提交。
