# 笔记网站 设计文档（Design Spec）

- **日期**：2026-06-27
- **状态**：已确认，待实施
- **作者**：brainstorming 产出

---

## 1. 概述

一个基于 Web 的个人笔记应用，支持用 Markdown 撰写笔记、用标签组织、全文搜索、导出，以及用户登录鉴权。

### 1.1 目标
- 单用户起步（只有自己使用），但**数据模型从一开始就按"笔记归属用户"设计**，未来开放多用户注册时无需痛苦迁移。
- 提供 Markdown 分栏编辑体验（左源码 / 右实时预览）。
- 扁平笔记列表 + 标签（多对多）组织。
- 笔记 CRUD、全文搜索、导出 `.md`、用户登录。
- 支持把笔记标记为"保护"，防止误删。

### 1.2 非目标（YAGNI，本期不做）
- 文件夹/树状分类（结构已预留，未来可加）。
- 图片/附件上传。
- 版本历史。
- 笔记分享/公开链接。
- 富文本（WYSIWYG）或块编辑器。

### 1.3 成功标准
- 能注册、登录，登录态受保护。
- 能新建/查看/编辑/删除笔记；受保护笔记无法删除。
- 能给笔记打标签、按标签筛选、按关键词全文搜索。
- 能把单条笔记导出为 `.md` 文件。
- 单测覆盖核心逻辑，特别是用户隔离与保护笔记不可删。

---

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | Python + FastAPI |
| 数据库 | SQLite + SQLAlchemy ORM（平滑可迁移至 PostgreSQL） |
| Monorepo | pnpm workspaces（前端）+ uv（后端） |
| 鉴权 | JWT（access + refresh token）+ bcrypt 密码哈希 |

---

## 3. 整体架构 & 目录结构

### 3.1 数据流
浏览器 SPA ⇄ REST API（FastAPI）⇄ SQLite（经 SQLAlchemy）。
前端 Vite dev server 将 `/api` 反向代理到后端，避免跨域。

### 3.2 Monorepo 目录

```
notes-app/
├── package.json              # 根：pnpm workspaces 配置 + 统一 dev 脚本（并发起前后端）
├── pnpm-workspace.yaml
├── .gitignore
├── README.md
├── apps/
│   ├── web/                  # 前端 React + TS + Vite
│   │   ├── package.json
│   │   ├── vite.config.ts    # 配置 /api 反向代理到后端
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── api/          # API 封装（axios 实例 + 拦截器自动带 token / 401 续期）
│   │       ├── components/   # Sidebar、NoteList、NoteEditor、MarkdownSplit、TagPicker
│   │       ├── pages/        # LoginPage、NotesPage
│   │       ├── hooks/        # useAuth、useNotes、useTags
│   │       ├── stores/       # 鉴权状态（Context/zustand）
│   │       └── types/        # TS 类型（与后端 Pydantic schema 对齐）
│   └── api/                  # 后端 Python + FastAPI
│       ├── pyproject.toml    # uv 管理依赖
│       └── app/
│           ├── main.py       # 入口 + 路由挂载 + CORS/异常处理
│           ├── config.py     # 配置（数据库 URL、JWT 密钥、过期时间）
│           ├── database.py   # SQLAlchemy 引擎 + session
│           ├── models/       # ORM 模型：User / Note / Tag / NoteTag
│           ├── schemas/      # Pydantic 入参/出参
│           ├── routers/      # auth、notes、tags、search
│           ├── services/     # 业务逻辑（与 router 解耦，便于测试）
│           ├── auth/         # JWT 生成/校验、bcrypt 哈希、依赖注入
│           └── deps.py       # 依赖：从 token 解出当前用户
└── scripts/                  # 一键 dev：并发跑 uvicorn + vite
```

### 3.3 分层原则
- 后端按 `routers → services → models` 分层：路由只做参数校验与调用，业务逻辑集中在 `services`，便于单测。
- 前端 `api/` 层统一封装，拦截器自动注入 JWT；服务端状态统一交给 TanStack Query。

---

## 4. 数据模型

所有业务表均以 `user_id` 隔离 —— 单用户阶段库中只有一个 user，但结构已具备多用户能力。

### 4.1 `users` 用户表
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | 主键 |
| username | str, 唯一非空 | 登录名 |
| email | str, 可空 | 预留，多用户时启用 |
| password_hash | str 非空 | bcrypt 哈希，绝不存明文 |
| created_at / updated_at | timestamp | |

### 4.2 `notes` 笔记表
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| user_id | FK → users.id | 归属用户（隔离关键） |
| title | str 非空 | 标题 |
| content | text, 默认 '' | Markdown 源码 |
| is_protected | bool, 默认 false | 为 true 时禁止删除 |
| created_at / updated_at | timestamp | 列表按 updated_at 倒序 |
| 索引 | | `(user_id, updated_at)` |

### 4.3 `tags` 标签表（按用户隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | |
| user_id | FK → users.id | 每个用户独立标签命名空间 |
| name | str | 联合唯一：`(user_id, name)` |

### 4.4 `note_tags` 关联表（多对多）
| 字段 | 类型 |
|---|---|
| note_id | FK → notes.id（级联删除） |
| tag_id | FK → tags.id（级联删除） |
| 主键 | `(note_id, tag_id)` |

### 4.5 全文搜索
使用 SQLite 内置 **FTS5**，对 `notes.title` + `notes.content` 建虚拟表，用触发器在笔记增改时自动同步。优于 `LIKE '%xx%'`，支持更好的匹配与排序，且零外部依赖。

### 4.6 关键约束
- 删除笔记时，`note_tags` 关联级联清除，不留垃圾数据。
- 标签名按用户唯一，避免多用户撞名。
- 全程记录时间戳，列表/排序依赖之。

---

## 5. API 设计

RESTful，统一 `/api` 前缀。除 `/auth/register`、`/auth/login`、`/auth/refresh` 外，均需携带有效 JWT。

### 5.1 鉴权 `/api/auth`
| 方法 路径 | 说明 |
|---|---|
| POST `/register` | `{username, password}` → `{user, access_token, refresh_token}` |
| POST `/login` | `{username, password}` → `{access_token, refresh_token}` |
| POST `/refresh` | `{refresh_token}` → 新的 `{access_token}` |
| GET `/me` | 返回当前登录用户 |

### 5.2 笔记 `/api/notes`（全部按当前用户隔离）
| 方法 路径 | 说明 |
|---|---|
| GET `/` | 列表；查询参数 `q`（搜索）、`tag`（按标签 id 过滤）、`page`/`limit`（分页）；按 updated_at 倒序 |
| POST `/` | 新建 `{title, content, tag_ids?, is_protected?}` |
| GET `/{id}` | 取单条（含其标签） |
| PUT `/{id}` | 修改（PATCH 语义）`{title?, content?, is_protected?, tag_ids?}`；content 变更才更新 updated_at |
| DELETE `/{id}` | 若 `is_protected=true` → 403；否则 204。删除受保护笔记需先用 PUT 将 `is_protected` 置为 `false`，再发起删除（两步操作防误删） |

### 5.3 标签 `/api/tags`
| 方法 路径 | 说明 |
|---|---|
| GET `/` | 当前用户所有标签（可带笔记计数） |
| POST `/` | 新建 `{name}` |
| DELETE `/{id}` | 删除标签（关联自动解除） |

### 5.4 导出
前端实现：将 `标题（# 一级标题）+ 正文` 拼接为 `.md`，用 `Blob` 触发浏览器下载。单条导出无需后端接口。

### 5.5 关键规则
- 所有 notes/tags 接口在 service 层强制按 `current_user.id` 过滤，杜绝越权。
- 统一错误响应格式：`{detail: string, code: string}`。

---

## 6. 前端结构

- **路由**：`react-router`。`/login` 登录页；`/` 主界面（受保护路由，未登录重定向到 `/login`）。
- **服务端状态**：**TanStack Query** 管理 notes/tags 的缓存、分页、自动刷新；CRUD 应用的最佳搭配。
- **鉴权状态**：`useAuth` + Context。token 存 localStorage（MVP 简单方案，注明 XSS 风险，后续可换 httpOnly cookie 加固）；`api/` 拦截器自动注入 token，401 时尝试 refresh，失败则跳登录。
- **Markdown 渲染**：`react-markdown` 做右侧预览；编辑区用受控 `<textarea>`（后续可升级 CodeMirror 加语法高亮）。
- **组件**：
  - `Sidebar`：新建笔记按钮、标签列表（点击筛选）。
  - `NoteList`：搜索框 + 笔记列表（标题、摘要、时间、标签）。
  - `NoteEditor`：标题输入、标签、🔒保护开关、导出按钮。
  - `MarkdownSplit`：左侧 `<textarea>` 源码 + 右侧 `react-markdown` 预览。
  - `TagPicker`：为笔记选择/新建标签。

---

## 7. 界面布局

登录后主界面为**三栏式**：

```
┌─────────────────────────────────────────────────────────┐
│  📝 笔记                  🔍 搜索框              👤 wqx ▾ │  顶栏
├──────────┬──────────────┬───────────────────────────────┤
│ ＋新建笔记 │ 全部·#React  │  标题 [tags] 🔒 ⬇导出          │
│          │              ├───────────────┬───────────────┤
│ 标签      │ 🔒 FastAPI路由 │  Markdown源码  │  实时预览      │
│ #FastAPI  │ ▸ 编辑器选型   │  # 标题        │  渲染结果      │
│ #React    │   周末计划     │  **加粗**      │               │
│ #随笔     │              │               │               │
│ ⎋退出     │              │               │               │
└──────────┴──────────────┴───────────────┴───────────────┘
  左栏        笔记列表          编辑器（分栏）
```

- 左栏点标签 → 中间列表按标签筛选。
- 中间点笔记 → 右侧分栏编辑（左写右看）。
- 🔒 表示已保护，禁用删除按钮。

---

## 8. 错误处理

### 8.1 后端（统一 `{detail, code}`）
| 状态码 | 含义 |
|---|---|
| 401 | 未登录或 token 过期 |
| 403 | 无权限（如删除保护笔记、越权访问他人数据） |
| 404 | 资源不存在 |
| 422 | 参数校验失败（FastAPI 默认） |
| 409 | 冲突（如用户名/标签名重复） |

### 8.2 前端
- API 拦截器：捕获 401 → 尝试用 refresh_token 续期；失败则跳转 `/login`。
- 表单错误就近显示在 UI。
- 编辑器**自动保存（防抖，如 1.5s）**，保存失败时提示并提供"重试"。

---

## 9. 测试策略

### 9.1 后端 `pytest`
使用 `TestClient` + 临时 SQLite。重点覆盖：
- 注册、登录、token 刷新。
- 笔记 CRUD。
- **受保护笔记不可删除**（返回 403）。
- 标签增删、笔记-标签关联。
- 全文搜索结果正确性。
- **用户隔离**：用户 A 无法读取/修改/删除用户 B 的笔记（返回 404）。

### 9.2 前端 `Vitest + React Testing Library`
- 关键组件交互（新建笔记、标签筛选、保护开关）。
- `useAuth` 等关键 hook 行为。
- E2E（Playwright）列为后续可选。

---

## 10. 未来扩展

- 开放多用户注册（数据模型已就绪，只需放开注册 + 完善权限）。
- 迁移到 PostgreSQL（ORM 抽象，主要改连接串与少量 FTS 语法）。
- 文件夹分类、图片上传、版本历史、分享链接。
- token 加固为 httpOnly cookie。
