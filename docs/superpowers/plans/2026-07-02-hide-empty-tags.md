# 侧边栏隐藏空标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧边栏只展示「有笔记引用」的标签（`note_count > 0`）；当前选中的标签变为空或被删除时，自动把筛选回退到「全部」。

**Architecture:** 纯前端、单文件（`apps/web/src/components/Sidebar.tsx`）改动。由 `useTags()` 返回的 `Tag[]` 派生 `visibleTags = tags.filter(t => t.note_count > 0)` 作为侧边栏渲染源；新增一个 `useEffect`，当 `selectedTagId` 指向的标签不在 `visibleTags` 中时调用 `onSelectTag(null)`。不动后端接口、不动 `TagPicker`、不动类型。

**Tech Stack:** React 18（函数组件）+ TypeScript + @tanstack/react-query + Tailwind；测试用 Vitest（jsdom）+ @testing-library/react。

对应 spec：`docs/superpowers/specs/2026-07-02-hide-empty-tags-design.md`

---

## File Structure

| 文件 | 职责 | 本计划动作 |
| --- | --- | --- |
| `apps/web/src/components/Sidebar.tsx` | 左栏：品牌 / 新建 / 标签筛选 / 账户退出 | **修改**：派生 `visibleTags`、改渲染源、加自动回退 `useEffect` |
| `apps/web/src/test/Sidebar.test.tsx` | `Sidebar` 的组件测试（过滤 + 自动回退） | **新建** |

> `TagPicker.tsx`、`hooks/useTags.ts`、`api/tags.ts`、后端 `routers/tags.py` / `services/tag_service.py` 等均**不改动**——这正是「仅侧边栏、前端过滤」方案的核心。

---

## Task 1：过滤掉空标签（`note_count === 0` 不渲染）

**Files:**
- Test: `apps/web/src/test/Sidebar.test.tsx`（新建）
- Modify: `apps/web/src/components/Sidebar.tsx`（派生 `visibleTags` 并作为渲染源）

- [ ] **Step 1：新建测试文件，写「空标签不渲染 / 非空渲染」的失败测试**

创建 `apps/web/src/test/Sidebar.test.tsx`，内容：

```tsx
// 侧边栏隐藏空标签：note_count===0 的标签不渲染；选中标签变空/被删时自动回退到「全部」
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import Sidebar from "../components/Sidebar";
import type { Tag } from "../types";

// 用 vi.hoisted 建立可变状态：mock 工厂读取该引用，每个用例直接改 state.tags 即可
const state = vi.hoisted(() => ({
  tags: [] as Tag[],
  user: { username: "alice" },
}));

vi.mock("../hooks/useTags", () => ({
  useTags: () => ({ data: state.tags }),
}));
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, logout: () => {} }),
}));

const TAGS: Tag[] = [
  { id: 1, name: "工作", note_count: 3 },
  { id: 2, name: "空标签", note_count: 0 },
  { id: 3, name: "生活", note_count: 1 },
];

describe("Sidebar 隐藏空标签", () => {
  it("note_count===0 的标签不渲染，note_count>0 的渲染", () => {
    state.tags = TAGS;
    const { getByText, queryByText } = render(
      <Sidebar selectedTagId={null} onSelectTag={() => {}} onCreate={() => {}} />
    );
    expect(getByText("工作")).toBeInTheDocument();
    expect(getByText("生活")).toBeInTheDocument();
    expect(queryByText("空标签")).toBeNull();
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

Run: `pnpm --filter web test -- run src/test/Sidebar.test.tsx`
Expected: FAIL —— 当前 `Sidebar` 渲染全部标签，`queryByText("空标签")` 返回元素而非 `null`，断言 `toBeNull()` 失败。

- [ ] **Step 3：实现过滤（派生 visibleTags 并作为渲染源）**

在 `apps/web/src/components/Sidebar.tsx` 中：

1. 找到组件内取数那行（约第 22 行）：
```tsx
  const { data: tags = [] } = useTags();
```
在其**下方**新增派生：
```tsx
  // 仅展示有笔记引用的标签（note_count > 0），空标签不占「标签位」
  const visibleTags = tags.filter((t) => t.note_count > 0);
```

2. 找到标签列表渲染（约第 68 行）：
```tsx
        {tags.map((t: TagType) => (
```
改为：
```tsx
        {visibleTags.map((t: TagType) => (
```
（该 `map` 回调体内容**保持不变**。）

- [ ] **Step 4：运行测试，确认通过**

Run: `pnpm --filter web test -- run src/test/Sidebar.test.tsx`
Expected: PASS（1 passed）。

- [ ] **Step 5：类型检查**

Run: `pnpm --filter web exec tsc -b`
Expected: 无报错退出（`visibleTags` 是 `Tag[]`，与原 `tags` 同型，`map` 回调签名不变）。

- [ ] **Step 6：提交**

```bash
git add apps/web/src/test/Sidebar.test.tsx apps/web/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(web): 侧边栏隐藏 note_count=0 的空标签

由 useTags 派生 visibleTags 作为渲染源；TagPicker 与后端接口不受影响。

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：选中标签变空/被删时自动回退到「全部」

**Files:**
- Test: `apps/web/src/test/Sidebar.test.tsx`（在 Task 1 基础上追加用例）
- Modify: `apps/web/src/components/Sidebar.tsx`（新增 `useEffect`）

- [ ] **Step 1：在测试文件中追加「自动回退」相关用例**

先把文件顶部 Testing Library 的导入补上 `waitFor`（本任务的新用例会用到）：

```tsx
import { render } from "@testing-library/react";
```
改为：
```tsx
import { render, waitFor } from "@testing-library/react";
```

然后在 `apps/web/src/test/Sidebar.test.tsx` 的 `describe` 块内（Task 1 那条用例之后）追加两条用例：

```tsx
  it("选中的标签变为 note_count===0 时，调用 onSelectTag(null) 回到「全部」", async () => {
    state.tags = TAGS; // id:1 工作(3) 可见，id:2 空(0)，id:3 生活(1)
    const onSelectTag = vi.fn();
    const { rerender } = render(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    // 初始「工作」可见，不应触发回退
    expect(onSelectTag).not.toHaveBeenCalled();

    // 模拟「工作」从唯一一篇笔记上被移除 -> note_count 变 0 -> 被过滤掉
    state.tags = [
      { id: 1, name: "工作", note_count: 0 },
      { id: 2, name: "空标签", note_count: 0 },
      { id: 3, name: "生活", note_count: 1 },
    ];
    rerender(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    await waitFor(() => expect(onSelectTag).toHaveBeenCalledWith(null));
  });

  it("选中的标签可见时，不调用 onSelectTag", () => {
    state.tags = TAGS;
    const onSelectTag = vi.fn();
    render(
      <Sidebar selectedTagId={1} onSelectTag={onSelectTag} onCreate={() => {}} />
    );
    expect(onSelectTag).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2：运行测试，确认新用例失败**

Run: `pnpm --filter web test -- run src/test/Sidebar.test.tsx`
Expected: 第一条（过滤）PASS；新加的「自动回退」用例 FAIL —— 尚无 `useEffect`，`onSelectTag` 未被调用，`toHaveBeenCalledWith(null)` 失败。

- [ ] **Step 3：实现自动回退 effect**

在 `apps/web/src/components/Sidebar.tsx` 中：

1. 把 React 导入从 `useState` 扩展为含 `useEffect`（文件顶部，约第 3 行）：
```tsx
import { useState } from "react";
```
改为：
```tsx
import { useEffect, useState } from "react";
```

2. 在 Task 1 新增的 `visibleTags` 那行**下方**追加 effect：
```tsx
  // 选中的标签变空（被过滤）或被删除时，自动回到「全部」，避免「无高亮 + 空列表」悬空态
  useEffect(() => {
    if (selectedTagId !== null && !visibleTags.some((t) => t.id === selectedTagId)) {
      onSelectTag(null);
    }
  }, [visibleTags, selectedTagId, onSelectTag]);
```

- [ ] **Step 4：运行该测试文件，确认全部通过**

Run: `pnpm --filter web test -- run src/test/Sidebar.test.tsx`
Expected: PASS（3 passed）。

- [ ] **Step 5：跑全量前端测试 + 类型检查，确认无回归**

Run: `pnpm --filter web test -- run`
Expected: 全部用例 PASS（含既有 `useAuth`、`icons` 等）。

Run: `pnpm --filter web exec tsc -b`
Expected: 无报错。

- [ ] **Step 6：提交**

```bash
git add apps/web/src/test/Sidebar.test.tsx apps/web/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(web): 选中标签变空/被删时自动回退到「全部」

新增 useEffect：selectedTagId 不在 visibleTags 中时调用 onSelectTag(null)。

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## 验收对照（spec → 任务）

| spec 要求 | 对应任务/步骤 |
| --- | --- |
| 侧边栏只展示 `note_count > 0` 的标签 | Task 1 Step 3（`visibleTags` 过滤 + 渲染源） |
| `TagPicker` 行为不变（仍显示全部标签） | 不改 `TagPicker.tsx`（File Structure 已声明） |
| 不动后端接口 / 类型 / 数据模型 | 仅改 `Sidebar.tsx` + 新增测试文件 |
| 选中标签变空 / 被删时自动回退到「全部」 | Task 2 Step 3（`useEffect`） |
| 守卫 `selectedTagId !== null` 防循环 | Task 2 Step 3 effect 代码内含守卫 |
| 覆盖「变空」与「被删」两种触发 | Task 2 Step 1 用例（变空）+ `!visibleTags.some(...)` 同样命中「不在列表」（被删）|

## 手动验证（实现完成后）

1. 创建一个新标签（不关联笔记）→ 侧边栏不出现该标签。
2. 把它加到一篇笔记 → 侧边栏出现，徽标为 1。
3. 选中该标签筛选 → 笔记列表只剩带该标签的笔记。
4. 把该标签从这（唯一）篇笔记上移除 → 侧边栏该标签消失，筛选自动回到「全部」，笔记列表恢复全部。
