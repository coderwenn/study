# 侧边栏隐藏空标签 — 设计文档

- 日期：2026-07-02
- 分支：`feat-tag`
- 涉及代码：`apps/web/src/components/Sidebar.tsx`（仅前端，单文件）

## 1. 背景与目标

当前侧边栏（`Sidebar.tsx`）会渲染当前用户的**全部**标签，每个标签后面带一个 `note_count` 徽标。
标签可以被独立创建（`TagPicker` 的「新建标签」、`POST /api/tags/`），因此会存在 `note_count === 0` 的「空标签」，它们在侧边栏里占据一个「标签位」却没有实际笔记。

**目标**：侧边栏标签列表只展示「有笔记引用」的标签（`note_count > 0`），没有笔记的标签不再占「标签位」。

## 2. 范围

- **仅侧边栏（`Sidebar`）** 隐藏空标签。
- **标签选择器（`TagPicker`）行为不变**，仍显示全部标签 —— 空标签恰恰是用户正要「加到笔记上」的，不能隐藏。
- **仅前端改动**，集中在 `Sidebar.tsx`。不动后端接口、不动 `TagPicker`、不动类型定义、不动数据模型。

### 为什么不用后端过滤

`TagPicker` 与 `Sidebar` 复用同一个 `useTags()` → `GET /api/tags/`。
若在后端过滤掉 `note_count === 0` 的标签，会连带让 `TagPicker` 看不到空标签，从而无法把空标签加到笔记上；要修复就得给接口加 `?include_empty=true` 之类的参数，违背最小改动原则。
因此选择**前端在 `Sidebar` 内部过滤**，保持单一数据源不变。

## 3. 现状回顾（相关代码）

- 选择状态 `tagId: number | null` 提升在 `NotesPage.tsx`，通过 props `selectedTagId` / `onSelectTag` 传入 `Sidebar`，同时作为 `tagId` 传给 `NoteList` 用于过滤笔记列表。
- `useTags()`（`hooks/useTags.ts`）返回 `Tag[]`，其中 `Tag.note_count: number` 始终存在（后端 `TagOut.note_count: int = 0`，由 `tag_service.list_tags` 按关联表 `note_tags` 分组计数得到）。
- `Sidebar` 当前直接 `tags.map(...)` 渲染全部标签。

## 4. 设计

### 4.1 过滤可见标签

在 `Sidebar` 内由 `tags` 派生 `visibleTags`，渲染源改为 `visibleTags`：

```tsx
const visibleTags = tags.filter((t) => t.note_count > 0);
// ...
{visibleTags.map((t: TagType) => ( /* 原渲染逻辑不变 */ ))}
```

### 4.2 选中态自动回退

当用户正按某标签筛选、而该标签变为空或被删除时，自动把筛选重置为「全部」，避免出现「侧边栏无高亮 + 笔记列表为空」的悬空态。
新增 `useEffect`（依赖 `visibleTags`、`selectedTagId`、`onSelectTag`）：

```tsx
useEffect(() => {
  if (selectedTagId !== null && !visibleTags.some((t) => t.id === selectedTagId)) {
    onSelectTag(null);
  }
}, [visibleTags, selectedTagId, onSelectTag]);
```

- 守卫 `selectedTagId !== null` 防止循环：回到 `null` 后条件不再成立，effect 变为 no-op。
- 一条条件覆盖两种触发场景：
  - 标签 `note_count → 0`（被 `visibleTags` 过滤掉）；
  - 标签被删除（彻底不在列表里）。

### 4.3 数据流（不变）

`useTags()` → `GET /api/tags/` → `Tag[]`（含 `note_count`）。
编辑笔记 / 删除笔记后，react-query 失效刷新 → `note_count` 更新 → `visibleTags` 重算 → effect 触发回退。

## 5. 边界情况

| 场景 | 行为 |
| --- | --- |
| 新建空标签（`TagPicker` 创建） | `note_count=0` → 侧边栏不显示（符合预期）；加到某篇笔记后 `note_count=1` → 侧边栏出现 |
| 选中态回退时机 | 仅在「当前选中的标签变为空 / 被删除」时触发；切到「全部」或其他标签不受影响（effect 为 no-op） |
| 首次加载态 | `tagId` 初始即 `null`，`tags` 首次加载前不会误触发清空 |
| `onSelectTag` 稳定性 | 其值为 `NotesPage` 的 `setTagId`（`useState` setter，引用稳定），可安全放入 effect 依赖 |

## 6. 测试

覆盖以下三点（具体落地为 vitest 组件测试还是手动验证，按现有 `apps/web/src/test` 目录约定在实现计划阶段确定）：

1. `note_count === 0` 的标签不出现在侧边栏，`note_count > 0` 的出现。
2. 当 `selectedTagId` 指向一个 `note_count === 0`（或不存在）的标签时，effect 调用 `onSelectTag(null)`。
3. 当 `selectedTagId` 指向一个可见（`note_count > 0`）的标签时，effect **不**调用 `onSelectTag`。

## 7. 不做（YAGNI）

- 不改后端接口、不加查询参数。
- 不改 `TagPicker`。
- 不引入「显示空标签」的开关 / 偏好设置。
- 不做软删除 / 回收站相关逻辑。
