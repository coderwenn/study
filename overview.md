# 废纸篓与笔记置顶功能 — 开发概览

**分支**：`feat/trash-pin`（基于 main `1e38935`）  
**提交**：`6fba7e6 feat: 新增废纸篓与笔记置顶功能`  
**改动**：16 个文件，+854 / -75 行

---

## 一、废纸篓功能（软删除）

### 数据模型
`Note` 表新增两个字段：
- `is_deleted BOOLEAN DEFAULT 0` — 软删除标记（索引）
- `deleted_at DATETIME` — 移入废纸篓时间

### 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| `DELETE` | `/api/notes/{id}` | **软删除**（移入废纸篓），受保护笔记返回 403 |
| `GET` | `/api/notes/trash/` | 列出废纸篓笔记（按删除时间倒序） |
| `POST` | `/api/notes/{id}/restore` | 从废纸篓恢复 |
| `DELETE` | `/api/notes/{id}/purge` | **彻底删除**（物理删除，仅限废纸篓中的笔记） |

### 行为规则
- 正常列表（`GET /api/notes/`）与搜索均排除 `is_deleted=True` 的笔记
- 软删除时同步取消置顶（废纸篓中的笔记不参与列表排序）
- 受保护笔记（`is_protected=True`）禁止软删除与彻底删除，需先解除保护
- 彻底删除仅允许针对已进入废纸篓的笔记，防止误操作直接物理删除活动笔记
- 详情接口（`GET /api/notes/{id}`）仍可访问废纸篓中的笔记（返回 `is_deleted=True`），便于预览

---

## 二、笔记置顶功能

### 数据模型
`Note` 表新增两个字段：
- `is_pinned BOOLEAN DEFAULT 0` — 置顶标记
- `pinned_at DATETIME` — 置顶时间

### 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/notes/{id}/pin` | 置顶（幂等） |
| `POST` | `/api/notes/{id}/unpin` | 取消置顶（幂等） |
| `PUT` | `/api/notes/{id}` | 更新支持 `is_pinned` 字段 |

### 排序规则
列表排序：`is_pinned DESC, pinned_at DESC NULLS LAST, updated_at DESC`
- 置顶笔记始终在最前
- 多条置顶笔记按置顶时间倒序（最近置顶的更靠前）
- 非置顶笔记按更新时间倒序

---

## 三、数据库迁移

`apps/api/app/database.py` 新增 `_migrate_notes_table()`：
- 通过 `PRAGMA table_info(notes)` 检查列是否存在
- 缺失的列用 `ALTER TABLE ADD COLUMN` 幂等补齐（带默认值，不破坏现有数据）
- 在 `init_db()` 中先迁移表结构，再建 FTS 索引

**已验证**：现有 `notes.db`（2 条真实数据）迁移后 4 个新列就位，旧数据默认值正确（`is_deleted=0, is_pinned=0`）。

---

## 四、前端改动

| 文件 | 改动 |
|------|------|
| `types/index.ts` | `Note`/`NoteListItem` 加置顶字段；新增 `TrashListItem` |
| `api/notes.ts` | 新增 `listTrash`/`restoreNote`/`purgeNote`/`pinNote`/`unpinNote` |
| `hooks/useNotes.ts` | 新增 `TRASH_KEY` 与 5 个 hooks，缓存失效策略：恢复/删除失效 notes+trash+tags；置顶失效 notes list+detail |
| `components/Sidebar.tsx` | 废纸篓可点击进入视图，显示数量角标；新增 `View` 类型与 `onViewChange` |
| `components/NoteList.tsx` | 置顶项浅底高亮 + Pin 图标；删除按钮 title 改为「移至废纸篓」 |
| `components/NoteEditor.tsx` | 顶栏新增置顶按钮（即时调用，不走防抖） |
| `components/TrashView.tsx` | **新组件**：废纸篓视图，恢复 + 彻底删除（二次确认） |
| `pages/NotesPage.tsx` | 维护 `view` 状态，切换 notes/trash 两种布局 |

---

## 五、测试

### 后端（pytest）
- **79/79 通过**，其中新增 11 个用例覆盖：软删除入废纸篓、受保护拦截、恢复、彻底删除、用户隔离、置顶排序、多置顶排序、取消置顶、PUT 置顶、软删除取消置顶、搜索排除废纸篓

### 前端（vitest + build）
- **70/70 测试通过**
- `pnpm build` 成功，TypeScript 类型检查无错误
- `Sidebar.test.tsx` 适配新 props（`view`/`onViewChange`）并 mock `useTrashList`

### 端到端验证
脚本验证完整流程：注册 → 创建 → 置顶（验证排序）→ 软删除（验证入废纸篓）→ 恢复 → 彻底删除 → 受保护拦截，全部通过。

---

## 六、通用要求达成情况

| 要求 | 达成 |
|------|------|
| 后端代码清晰中文注释（接口用途/参数/返回值） | ✓ 路由与 service 均有中文 docstring 说明用途、参数、返回值与状态码 |
| 代码结构规范、命名清晰、错误处理与参数校验 | ✓ 分层（model/schema/router/service）；Pydantic 校验；403/404 状态码语义清晰 |
| 前端交互流畅、状态更新及时 | ✓ TanStack Query 自动失效缓存；置顶/删除即时响应；废纸篓二次确认 |
| 与后端数据同步 | ✓ 所有变更后失效对应缓存（notes/trash/tags），列表自动重新拉取 |
