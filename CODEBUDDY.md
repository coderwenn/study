# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 常用命令

```bash
# 安装依赖（前端在仓库根目录，后端在 apps/api）
pnpm install
cd apps/api && uv sync

# 同时启动前端(:5173)+ 后端(:8000)，必须在仓库根目录执行
pnpm dev

# 单独启动后端
cd apps/api && uv run uvicorn app.main:app --reload --port 8000

# 构建前端
pnpm build

# 后端测试（全部）
cd apps/api && uv run pytest

# 后端测试（单个文件 / 单个用例）
cd apps/api && uv run pytest tests/test_notes.py
cd apps/api && uv run pytest tests/test_notes.py::test_create_note

# 前端测试
cd apps/web && pnpm test -- --run

# 部署（生产）：先在根目录 .env 设置 SECRET_KEY 与 HERMES_API_KEY
docker compose up -d --build
```

前端 dev server 通过 `vite.config.ts` 把 `/api/*` 反代到 `http://localhost:8000`。**后端未启动时，Vite 代理会向浏览器返回 HTTP 500（非 502）**。看到 `/api/*` 全部报 500，先确认是否在根目录跑了 `pnpm dev` 把后端带起来，而不是只单独跑了 `apps/web`。

## 架构

Monorepo（pnpm workspace + uv）：`apps/web`（React 18 + Vite + TypeScript）前端 + `apps/api`（FastAPI + SQLAlchemy 2.0 + SQLite）后端。根目录 `package.json` 用 `concurrently` 同时拉起两端。

### 后端分层（`apps/api/app/`）

严格分层，职责不可错位：

- `models/` — SQLAlchemy ORM 模型（`note` / `tag` / `user`）。`Note` 与 `Tag` 多对多关联（`note_tags` 表）。所有数据按 `user_id` 隔离。
- `schemas/` — Pydantic 入参出参。列表接口返回 `*ListItem`（含摘要、不含完整正文），详情返回 `*Out`。
- `routers/` — 只做参数解析、鉴权依赖注入与编排，**不写业务逻辑**。所有路由挂 `/api` 前缀。
- `services/` — 业务逻辑落点。`note_service` / `tag_service` / `search_service` / `wiki_publish_service` / `summarize_service` / `pdf_import_service` / `rate_limiter`。
- `auth/` — JWT 签发解析（`jwt.py`）、密码哈希（`security.py`）、FastAPI 依赖 `get_current_user`（`deps.py`，解析 Bearer token 返回 `User`）。
- `config.py` — pydantic-settings 集中配置，敏感值从 `.env` 读，**不要散落硬编码**。
- `database.py` — 引擎、会话工厂、`Base`、`get_db` 依赖、`init_db()`。FTS5 虚拟表与触发器在此创建。

**鉴权**：双令牌（access 30min + refresh 7d），JWT payload 带 `type` 字段区分。`get_current_user` 依赖校验 access token 类型。

**全文搜索**：SQLite FTS5（trigram 分词），逻辑集中在 `services/search_service.py`，**不要在 router 里直接写 SQL**。trigram 要求 MATCH 查询至少 3 字符，短查询（<3）自动回退 LIKE 子串匹配。搜索结果排除废纸篓笔记（`is_deleted=0`），按相关度排序（保留 FTS rank），置顶排序仅在列表层处理。

**数据隔离**：笔记、标签数据一律按 `user_id` 隔离——列表、搜索、过滤、详情都要带当前登录用户。越权访问统一返回 404（不暴露资源存在性）。

**废纸篓与置顶**：`Note` 表有 `is_deleted`/`deleted_at`（软删除）、`is_pinned`/`pinned_at`（置顶）、`is_protected`（防误删保护）。列表排序：`is_pinned DESC, pinned_at DESC NULLS LAST, updated_at DESC`。软删除同步取消置顶。受保护笔记禁止删除与彻底删除。彻底删除（`purge`）仅允许针对废纸篓中的笔记。

**数据库迁移**：`_migrate_notes_table()` 在 `init_db()` 中幂等执行，通过 `PRAGMA table_info` 检查列是否存在，缺失则 `ALTER TABLE ADD COLUMN`。新加字段时遵循此模式，不要引入 Alembic（开发环境用 `create_all`，生产也是同一套）。

**可选功能开关**：Wiki 发布（`WIKI_OWNER`）、网页总结（`LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` 三件全填）——配置为空时端点返回 503。

**Python 代码尽量都加中文注释**（接口用途、参数、返回值、状态码语义）。router 与 service 均有中文 docstring。

### 前端分层（`apps/web/src/`）

- `api/` — axios 请求封装，**组件里不直接写 axios/fetch**。`client.ts` 是统一实例：请求拦截注入 Bearer token，响应拦截 401 时尝试 refresh、失败跳登录。
- `hooks/` — TanStack Query hooks（`useNotes` / `useTags` / `useAuth` / `useTheme`）。服务端状态与缓存失效策略集中于此。mutation 成功后 `invalidateQueries` 失效相关缓存（笔记变更同时失效 notes + tags + trash）。
- `components/` — 编辑器 UI（`NoteEditor` / `EditorToolbar` / `MarkdownSplit`）、列表与导航（`NoteList` / `Sidebar` / `TrashView`）、对话框（`SummarizeDialog` / `ImportDialog` / `PdfImportDialog` / `SettingsDialog`）。
- `editor/` — **Markdown 编辑逻辑**（命令、选区编辑、快捷键），与 UI 分离。`markdownCommands.ts` / `runEdit.ts` / `useEditorShortcuts.ts`。
- `pages/` — `LoginPage` / `NotesPage`。`NotesPage` 是三栏布局主界面，状态提升到此层，支持 `notes` / `trash` 两种视图切换。
- `types/` — TypeScript 类型定义，与后端 schema 对齐。

**CSS 方案**：Tailwind CSS，**不写自定义 class**。

**React**：使用函数组件，做好 TypeScript 类型规范。

**鉴权流程**：token 存 localStorage（`notes_access_token` / `notes_refresh_token`）。`AuthProvider` 启动时若有 token 拉取 `/api/auth/me`。退出时先 `qc.clear()` 清空 react-query 缓存再清 token，避免下个登录用户短暂看到上一个账号数据（数据串号）。

### API 约定

- 所有路由挂 `/api` 前缀：`/api/health`、`/api/notes`、`/api/tags`、`/api/auth/*`、`/api/summarize`、`/api/pdf`、`/api/wiki`。
- 列表接口返回 `*ListItem`（含摘要、分页），详情返回 `*Out`。
- 状态码：创建 200、删除 204、标签重名 409、受保护笔记删除 403、越权或不存在 404。

### 领域语言（来自 `CONTEXT.md`）

- **Note（笔记）**：笔记应用里的一条用户记录（标题 + Markdown 正文 + 标签），按用户隔离，本身不是文件。避免叫「文档」「page」。
- **Wiki Source（来源）**：笔记发布到 wiki 后的 Markdown 文件，作为 llm-wiki 原始素材。避免叫「wiki page」。
- **导出（Export）**：浏览器端生成 .md 下载，纯前端，不碰服务器文件系统。
- **发布到 Wiki（Publish to Wiki）**：服务端把笔记物化成 Wiki Source 写进 `entries/` 目录，无状态，按标题 slug 覆盖。
- **网页总结（Summarize from Link）**：无状态后端动作，抓取并理解一条链接产出草稿，不落库不写文件。
- **草稿（Draft）**：网页总结返回前端的临时结果，不持久化，确认保存后才物化为 Note。

## 工作约定

- 每次写好代码自己 CR 一遍。
- `docs/` 下有设计文档（specs）与实施计划（plans），改动较大时先看是否已有相关 spec。
