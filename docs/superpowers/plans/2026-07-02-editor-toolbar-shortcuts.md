# 编辑区 Markdown 工具栏与快捷键 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在笔记正文 textarea 上加一条常驻格式工具栏 + 一套浏览器保留键安全的快捷键，对选区/当前行插入或切换 Markdown 语法，保留原生 ⌘Z 撤销且不破坏中文输入法。

**Architecture:** 保留 textarea 内核。新增纯函数命令集（输入 `EditorState` → 输出 `Edit`，零 DOM 依赖、可单测）；一个 `runEdit` 把 `Edit` 通过 `document.execCommand` 写回（保撤销，带 fallback）；一个快捷键 hook（IME guard + `e.code` 分发）；一个工具栏组件；改 `MarkdownSplit`/`NoteEditor` 接入。详见 `docs/superpowers/specs/2026-07-02-editor-toolbar-shortcuts-design.md` 与 ADR-001。

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind 3（utility-only）+ `react-markdown` v10 + 新增 `remark-gfm` + `lucide-react`；测试 vitest + @testing-library/react + jsdom。

**约定：**
- 所有新增/修改文件路径均在 `apps/web/` 下。
- 运行测试统一：`pnpm --filter web test -- --run`（vitest watch 模式用 `pnpm --filter web test`）。单文件：`pnpm --filter web test -- --run src/test/<file>.test.tsx`。
- 提交信息沿用仓库 conventional commits 风格（中文描述）。
- 命令模型的 `Edit` 与纯函数是 TDD 的核心；DOM/execCommand 部分用 fallback 路径在 jsdom 下覆盖。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `src/editor/types.ts` | `EditorState` / `Edit` 类型 + 纯函数 `applyEdit` | 新建 |
| `src/editor/markdownCommands.ts` | 全部命令（返回 `Edit`）+ `commands` 注册表 + `keymap` | 新建 |
| `src/editor/runEdit.ts` | 把 `Edit` 写回 textarea（execCommand + fallback） | 新建 |
| `src/editor/useEditorShortcuts.ts` | 快捷键 hook | 新建 |
| `src/components/EditorToolbar.tsx` | 顶部常驻工具栏 | 新建 |
| `src/components/MarkdownSplit.tsx` | 接入 ref/选区/工具栏/hook + remark-gfm | 修改 |
| `src/components/NoteEditor.tsx` | 接入 ⌘S 立即保存 | 修改 |
| `src/test/markdownCommands.test.ts` | 命令纯函数测试 | 新建 |
| `src/test/useEditorShortcuts.test.tsx` | hook 行为测试 | 新建 |
| `src/test/EditorToolbar.test.tsx` | 工具栏渲染测试 | 新建 |
| `src/test/MarkdownSplit.test.tsx` | remark-gfm 渲染 + 接入回归 | 新建 |

---

## Task 1：接入 remark-gfm（预览支持 GFM）

**Files:**
- Modify: `apps/web/package.json`（依赖）
- Modify: `apps/web/src/components/MarkdownSplit.tsx`
- Test: `apps/web/src/test/MarkdownSplit.test.tsx`

- [ ] **Step 1: 安装依赖**

Run:
```bash
pnpm --filter web add remark-gfm
```
Expected: `remark-gfm` 出现在 `apps/web/package.json` 的 dependencies。

- [ ] **Step 2: 写失败测试（GFM 删除线应渲染为 `<del>`）**

创建 `apps/web/src/test/MarkdownSplit.test.tsx`：

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MarkdownSplit from "../components/MarkdownSplit";

describe("MarkdownSplit", () => {
  it("GFM 删除线渲染为 <del>", () => {
    const { container } = render(<MarkdownSplit value="~~删除~~" onChange={() => {}} />);
    expect(container.querySelector("del")).not.toBeNull();
  });

  it("GFM 任务列表渲染为 checkbox", () => {
    const { container } = render(<MarkdownSplit value={"- [ ] 任务"} onChange={() => {}} />);
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/MarkdownSplit.test.tsx`
Expected: FAIL（`del` 为 null —— 未接 remark-gfm）。

- [ ] **Step 4: 接入 remark-gfm**

修改 `apps/web/src/components/MarkdownSplit.tsx` 顶部导入与 `ReactMarkdown`：

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

将预览区的 `<ReactMarkdown>{value}</ReactMarkdown>` 改为：

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/MarkdownSplit.test.tsx`
Expected: PASS。

- [ ] **Step 6: 回归现有预览**

Run: `pnpm --filter web dev`，打开一篇含表格/普通标题的笔记，确认预览正常无报错。停止 dev。

- [ ] **Step 7: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/components/MarkdownSplit.tsx apps/web/src/test/MarkdownSplit.test.tsx
git commit -m "feat(web): 预览接入 remark-gfm 支持 GFM 语法"
```

---

## Task 2：命令核心模型 + 纯函数 applyEdit

**Files:**
- Create: `apps/web/src/editor/types.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`

- [ ] **Step 1: 写失败测试（applyEdit 把 Edit 作用到 EditorState）**

创建 `apps/web/src/test/markdownCommands.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { applyEdit } from "../editor/types";

describe("applyEdit", () => {
  it("用 insert 替换 [start,end) 并更新选区", () => {
    const next = applyEdit(
      { value: "hello world", selectionStart: 0, selectionEnd: 5 },
      { deleteStart: 0, deleteEnd: 5, insert: "HELLO", selectStart: 1, selectEnd: 3 }
    );
    expect(next.value).toBe("HELLO world");
    expect(next.selectionStart).toBe(1);
    expect(next.selectionEnd).toBe(3);
  });

  it("insert 为空即纯删除", () => {
    const next = applyEdit(
      { value: "abc", selectionStart: 1, selectionEnd: 2 },
      { deleteStart: 1, deleteEnd: 2, insert: "", selectStart: 1, selectEnd: 1 }
    );
    expect(next.value).toBe("ac");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 types.ts**

创建 `apps/web/src/editor/types.ts`：

```ts
// 编辑器在某时刻的不可变快照：文本 + 选区
export interface EditorState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

// 一条对文本的编辑：把 [deleteStart, deleteEnd) 替换为 insert，再把选区设为 [selectStart, selectEnd)
export interface Edit {
  deleteStart: number;
  deleteEnd: number;
  insert: string;
  selectStart: number;
  selectEnd: number;
}

// 命令：输入快照 → 输出一条 Edit（不碰 DOM）
export type Command = (s: EditorState) => Edit;

// 纯函数：把 Edit 作用到 EditorState，得到新的 EditorState（测试与 fallback 共用）
export function applyEdit(s: EditorState, e: Edit): EditorState {
  const value = s.value.slice(0, e.deleteStart) + e.insert + s.value.slice(e.deleteEnd);
  return { value, selectionStart: e.selectStart, selectionEnd: e.selectEnd };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/types.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 编辑器命令核心模型 EditorState/Edit/applyEdit"
```

---

## Task 3：行内包裹命令（bold/italic/strikethrough/inlineCode/link）

**Files:**
- Modify: `apps/web/src/editor/markdownCommands.ts`（新建）
- Test: `apps/web/src/test/markdownCommands.test.ts`

- [ ] **Step 1: 写失败测试（加粗 toggle / 无选区 / 已包裹）**

在 `markdownCommands.test.ts` 顶部追加导入：

```ts
import { bold, italic, strikethrough, inlineCode, link } from "../editor/markdownCommands";
import { applyEdit } from "../editor/types";
```

追加测试：

```ts
describe("bold", () => {
  it("选中文本 → 包裹 **", () => {
    const e = bold({ value: "加粗", selectionStart: 0, selectionEnd: 2 });
    const r = applyEdit({ value: "加粗", selectionStart: 0, selectionEnd: 2 }, e);
    expect(r.value).toBe("**加粗**");
  });

  it("无选区 → 插入 **** 光标居中", () => {
    const e = bold({ value: "", selectionStart: 0, selectionEnd: 0 });
    const r = applyEdit({ value: "", selectionStart: 0, selectionEnd: 0 }, e);
    expect(r.value).toBe("****");
    expect(r.selectionStart).toBe(2);
    expect(r.selectionEnd).toBe(2);
  });

  it("已包裹 **x** → 去包裹", () => {
    const s = { value: "**加粗**", selectionStart: 2, selectionEnd: 4 };
    const e = bold(s);
    const r = applyEdit(s, e);
    expect(r.value).toBe("加粗");
  });
});

describe("inline 包裹类（italic/strike/code）", () => {
  it("italic 选中文本 → *x*", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, italic(s)).value).toBe("*x*");
  });
  it("strikethrough → ~~x~~", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, strikethrough(s)).value).toBe("~~x~~");
  });
  it("inlineCode → `x`", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, inlineCode(s)).value).toBe("`x`");
  });
});

describe("link", () => {
  it("选中文本 → [文本](url)", () => {
    const s = { value: "链接", selectionStart: 0, selectionEnd: 2 };
    const e = link(s);
    const r = applyEdit(s, e);
    expect(r.value).toBe("[链接](url)");
    // 选区落在 url 占位上，便于直接粘贴替换
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("url");
  });
  it("无选区 → [链接文本](url) 选区落在「链接文本」", () => {
    const s = { value: "", selectionStart: 0, selectionEnd: 0 };
    const r = applyEdit(s, link(s));
    expect(r.value).toBe("[链接文本](url)");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("链接文本");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL（模块/命令不存在）。

- [ ] **Step 3: 实现 markdownCommands.ts（wrapInline 工具 + 五个命令）**

创建 `apps/web/src/editor/markdownCommands.ts`：

```ts
import type { Command, EditorState, Edit } from "./types";

// 行内包裹工具：成对加 marker，已包裹则去包裹，无选区则插入空标记并光标居中
function wrapInline(marker: string): Command {
  const open = marker;
  const close = marker;
  return (s: EditorState): Edit => {
    const sel = s.value.slice(s.selectionStart, s.selectionEnd);
    // 去包裹：选区两侧正好是 marker
    const before = s.value.slice(s.selectionStart - open.length, s.selectionStart);
    const after = s.value.slice(s.selectionEnd, s.selectionEnd + close.length);
    if (sel.length > 0 && before === open && after === close) {
      return {
        deleteStart: s.selectionStart - open.length,
        deleteEnd: s.selectionEnd + close.length,
        insert: sel,
        selectStart: s.selectionStart - open.length,
        selectEnd: s.selectionStart - open.length + sel.length,
      };
    }
    // 包裹
    const inserted = open + sel + close;
    return {
      deleteStart: s.selectionStart,
      deleteEnd: s.selectionEnd,
      insert: inserted,
      selectStart: s.selectionStart + open.length,
      selectEnd: s.selectionStart + open.length + sel.length,
    };
  };
}

export const bold: Command = wrapInline("**");
export const italic: Command = wrapInline("*");
export const strikethrough: Command = wrapInline("~~");
export const inlineCode: Command = wrapInline("`");

// 链接：[文本](url)，选区落在 url（有选区）或「链接文本」（无选区）
export const link: Command = (s: EditorState): Edit => {
  const sel = s.value.slice(s.selectionStart, s.selectionEnd);
  const text = sel.length > 0 ? sel : "链接文本";
  const inserted = `[${text}](url)`;
  const urlStart = s.selectionStart + 1 + text.length + 1; // [ 文本 ](
  if (sel.length > 0) {
    return {
      deleteStart: s.selectionStart,
      deleteEnd: s.selectionEnd,
      insert: inserted,
      selectStart: urlStart,
      selectEnd: urlStart + "url".length,
    };
  }
  // 无选区：选区落在「链接文本」
  return {
    deleteStart: 0 + s.selectionStart,
    deleteEnd: 0 + s.selectionEnd,
    insert: inserted,
    selectStart: s.selectionStart + 1,
    selectEnd: s.selectionStart + 1 + text.length,
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/markdownCommands.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 行内包裹命令 bold/italic/strike/code/link"
```

---

## Task 4：行首前缀命令（H1-H3 / 引用 / 无序 / 有序 / 任务）

**Files:**
- Modify: `apps/web/src/editor/markdownCommands.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`

- [ ] **Step 1: 写失败测试**

在 `markdownCommands.test.ts` 追加导入：

```ts
import { h1, h2, h3, quote, unorderedList, orderedList, taskList } from "../editor/markdownCommands";
```

追加测试：

```ts
describe("行首前缀命令", () => {
  const st = (value: string, a: number, b: number) => ({ value, selectionStart: a, selectionEnd: b });

  it("h1 单行 → 行首加 # ", () => {
    const s = st("标题", 0, 2);
    expect(applyEdit(s, h1(s)).value).toBe("# 标题");
  });
  it("h1 已有 # → 去除（toggle）", () => {
    const s = st("# 标题", 0, 0);
    expect(applyEdit(s, h1(s)).value).toBe("标题");
  });
  it("h2 选 H1 行 → 替换为 H2", () => {
    const s = st("# 标题", 0, 0);
    expect(applyEdit(s, h2(s)).value).toBe("## 标题");
  });
  it("多行选区 → 每行都加 - ", () => {
    const s = st("a\nb", 0, 3);
    expect(applyEdit(s, unorderedList(s)).value).toBe("- a\n- b");
  });
  it("orderedList → 1. 前缀", () => {
    const s = st("a\nb", 0, 3);
    expect(applyEdit(s, orderedList(s)).value).toBe("1. a\n1. b");
  });
  it("orderedList 已有数字前缀 → 去除", () => {
    const s = st("1. a", 0, 0);
    expect(applyEdit(s, orderedList(s)).value).toBe("a");
  });

  it("taskList 三态：无 → [ ] → [x] → 去除", () => {
    const s0 = st("项", 0, 1);
    expect(applyEdit(s0, taskList(s0)).value).toBe("- [ ] 项");
    const s1 = st("- [ ] 项", 0, 0);
    expect(applyEdit(s1, taskList(s1)).value).toBe("- [x] 项");
    const s2 = st("- [x] 项", 0, 0);
    expect(applyEdit(s2, taskList(s2)).value).toBe("项");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL（命令未定义）。

- [ ] **Step 3: 实现 toggleLinePrefix + 各命令**

在 `markdownCommands.ts` 末尾追加：

```ts
// 选区覆盖到的行范围 [startLineStart, lastLineEnd)
function lineRange(s: EditorState): { start: number; end: number } {
  const start = s.value.lastIndexOf("\n", s.selectionStart - 1) + 1; // 当选区在行首时 lastIndexOf 返回 -1 → 0
  let end = s.value.indexOf("\n", s.selectionEnd);
  if (end === -1) end = s.value.length;
  return { start, end };
}

// 行首前缀 toggle：若每行都已是指定前缀则去除，否则给每行加上前缀
function toggleLinePrefix(prefix: string): Command {
  return (s: EditorState): Edit => {
    const { start, end } = lineRange(s);
    const block = s.value.slice(start, end);
    const lines = block.split("\n");
    const allHave = lines.length > 0 && lines.every((l) => l.startsWith(prefix));
    let nextBlock: string;
    if (allHave) {
      nextBlock = lines.map((l) => l.slice(prefix.length)).join("\n");
    } else {
      nextBlock = lines.map((l) => prefix + l).join("\n");
    }
    return {
      deleteStart: start,
      deleteEnd: end,
      insert: nextBlock,
      selectStart: start,
      selectEnd: start + nextBlock.length,
    };
  };
}

export const h1: Command = toggleLinePrefix("# ");
export const h2: Command = toggleLinePrefix("## ");
export const h3: Command = toggleLinePrefix("### ");
export const quote: Command = toggleLinePrefix("> ");
export const unorderedList: Command = toggleLinePrefix("- ");
export const orderedList: Command = toggleLinePrefix("1. ");

// 任务列表三态：无 → "- [ ] " → "- [x] " → 去除
export const taskList: Command = (s: EditorState): Edit => {
  const { start, end } = lineRange(s);
  const block = s.value.slice(start, end);
  const lines = block.split("\n");
  const allUnchecked = lines.every((l) => l.startsWith("- [ ] "));
  const allChecked = lines.every((l) => l.startsWith("- [x] "));
  let nextBlock: string;
  if (allUnchecked) {
    nextBlock = lines.map((l) => "- [x] " + l.slice(6)).join("\n");
  } else if (allChecked) {
    nextBlock = lines.map((l) => l.slice(6)).join("\n");
  } else {
    nextBlock = lines.map((l) => "- [ ] " + l).join("\n");
  }
  return {
    deleteStart: start,
    deleteEnd: end,
    insert: nextBlock,
    selectStart: start,
    selectEnd: start + nextBlock.length,
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/markdownCommands.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 行首前缀命令 h1-h3/quote/list/task"
```

---

## Task 5：块命令（codeBlock / insertTable / horizontalRule）

**Files:**
- Modify: `apps/web/src/editor/markdownCommands.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`

- [ ] **Step 1: 写失败测试**

追加导入：`import { codeBlock, insertTable, horizontalRule } from "../editor/markdownCommands";`

追加测试：

```ts
describe("块命令", () => {
  it("codeBlock 选中 → 用围栏包裹", () => {
    const s = { value: "code", selectionStart: 0, selectionEnd: 4 };
    expect(applyEdit(s, codeBlock(s)).value).toBe("```\ncode\n```");
  });
  it("insertTable → 插入 2x2 模板", () => {
    const s = { value: "", selectionStart: 0, selectionEnd: 0 };
    const r = applyEdit(s, insertTable(s));
    expect(r.value).toBe("| 列1 | 列2 |\n| --- | --- |\n|  |  |");
  });
  it("horizontalRule → 插入 --- 与前后空行", () => {
    const s = { value: "x", selectionStart: 1, selectionEnd: 1 };
    const r = applyEdit(s, horizontalRule(s));
    expect(r.value).toContain("\n---\n");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现块命令**

在 `markdownCommands.ts` 末尾追加：

```ts
// 代码块：选区外包 ``` 围栏
export const codeBlock: Command = (s: EditorState): Edit => {
  const sel = s.value.slice(s.selectionStart, s.selectionEnd);
  const inner = sel.length > 0 ? sel : "";
  const inserted = "```\n" + inner + "\n```";
  return {
    deleteStart: s.selectionStart,
    deleteEnd: s.selectionEnd,
    insert: inserted,
    selectStart: s.selectionStart,
    selectEnd: s.selectionStart + inserted.length,
  };
};

// 表格模板（2 列 2 行，含分隔行）
export const insertTable: Command = (s: EditorState): Edit => {
  const inserted = "| 列1 | 列2 |\n| --- | --- |\n|  |  |";
  return {
    deleteStart: s.selectionStart,
    deleteEnd: s.selectionEnd,
    insert: inserted,
    selectStart: s.selectionStart,
    selectEnd: s.selectionStart + inserted.length,
  };
};

// 分割线：前后补空行，避免与上下文粘连
export const horizontalRule: Command = (s: EditorState): Edit => {
  const inserted = "\n---\n";
  return {
    deleteStart: s.selectionStart,
    deleteEnd: s.selectionEnd,
    insert: inserted,
    selectStart: s.selectionStart + inserted.length,
    selectEnd: s.selectionStart + inserted.length,
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/markdownCommands.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 块命令 codeBlock/insertTable/horizontalRule"
```

---

## Task 6：缩进命令（indent / outdent）

**Files:**
- Modify: `apps/web/src/editor/markdownCommands.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`

- [ ] **Step 1: 写失败测试**

追加导入：`import { indent, outdent } from "../editor/markdownCommands";`

追加测试：

```ts
describe("indent / outdent", () => {
  const st = (value: string, a: number, b: number) => ({ value, selectionStart: a, selectionEnd: b });

  it("indent 普通单行选区 → 整行 +2 空格", () => {
    const s = st("abc", 0, 3);
    expect(applyEdit(s, indent(s)).value).toBe("  abc");
  });
  it("indent 多行 → 每行 +2", () => {
    const s = st("a\nb", 0, 3);
    expect(applyEdit(s, indent(s)).value).toBe("  a\n  b");
  });
  it("outdent 已缩进行 → 去 2 空格（上限 2）", () => {
    const s = st("    a", 0, 0);
    expect(applyEdit(s, outdent(s)).value).toBe("  a");
  });
  it("outdent 列表项 → 升级（去 2 空格）", () => {
    const s = st("  - 子", 0, 0);
    expect(applyEdit(s, outdent(s)).value).toBe("- 子");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 indent / outdent**

在 `markdownCommands.ts` 末尾追加：

```ts
// 缩进：对选区覆盖的每一行行首加 2 空格（列表项即降级为子列表）
export const indent: Command = (s: EditorState): Edit => {
  const { start, end } = lineRange(s);
  const block = s.value.slice(start, end);
  const nextBlock = block.split("\n").map((l) => "  " + l).join("\n");
  // 选区随每行前缀同步前移 2；多行时整体选中结果块
  const shift = 2;
  return {
    deleteStart: start,
    deleteEnd: end,
    insert: nextBlock,
    selectStart: s.selectionStart + shift,
    selectEnd: s.selectionEnd + (s.value.slice(start, s.selectionEnd).split("\n").length * shift),
  };
};

// 反缩进：对选区覆盖的每一行去除最多 2 个前导空格（列表项即升级）
export const outdent: Command = (s: EditorState): Edit => {
  const { start, end } = lineRange(s);
  const block = s.value.slice(start, end);
  const lines = block.split("\n");
  let removed = 0;
  let firstRemoved = 0;
  const nextLines = lines.map((l, i) => {
    const n = l.startsWith("  ") ? 2 : l.startsWith(" ") ? 1 : 0;
    if (i === 0) firstRemoved = n;
    removed += n;
    return l.slice(n);
  });
  const nextBlock = nextLines.join("\n");
  return {
    deleteStart: start,
    deleteEnd: end,
    insert: nextBlock,
    selectStart: Math.max(s.selectionStart - firstRemoved, start),
    selectEnd: Math.max(s.selectionEnd - removed, start),
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/markdownCommands.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 缩进命令 indent/outdent"
```

---

## Task 7：命令注册表 + 快捷键映射表

**Files:**
- Modify: `apps/web/src/editor/markdownCommands.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`

> 说明：快捷键用 `e.code` 匹配（而非 `e.key`）。因为 `Shift+7` 的 `e.key` 是 `"&"` 而非 `"7"`，用 `e.code`（`Digit7`）才稳定。键签名格式：`mod+` / `alt+` / `shift+` 前缀 + `e.code`。

- [ ] **Step 1: 写失败测试（注册表 + keymap 完备）**

追加测试：

```ts
import { commands, keymap, commandOrder } from "../editor/markdownCommands";

describe("注册表", () => {
  it("commands 覆盖所有命令 id", () => {
    const ids = Object.keys(commands);
    expect(ids).toEqual(
      expect.arrayContaining([
        "bold", "italic", "strikethrough", "inlineCode", "link",
        "h1", "h2", "h3", "quote", "unorderedList", "orderedList", "taskList",
        "codeBlock", "insertTable", "horizontalRule", "indent", "outdent",
      ])
    );
  });
  it("keymap 把组合映射到命令 id", () => {
    expect(keymap["mod+KeyB"]).toBe("bold");
    expect(keymap["mod+KeyI"]).toBe("italic");
    expect(keymap["mod+shift+KeyX"]).toBe("strikethrough");
    expect(keymap["mod+KeyE"]).toBe("inlineCode");
    expect(keymap["mod+KeyK"]).toBe("link");
    expect(keymap["mod+alt+Digit1"]).toBe("h1");
    expect(keymap["mod+alt+Digit2"]).toBe("h2");
    expect(keymap["mod+alt+Digit3"]).toBe("h3");
    expect(keymap["mod+alt+KeyQ"]).toBe("quote");
    expect(keymap["mod+alt+KeyC"]).toBe("codeBlock");
    expect(keymap["mod+shift+Digit8"]).toBe("unorderedList");
    expect(keymap["mod+shift+Digit7"]).toBe("orderedList");
    expect(keymap["mod+alt+KeyT"]).toBe("taskList");
  });
  it("commandOrder 给出工具栏分组顺序", () => {
    expect(commandOrder[0]).toBe("bold");
    expect(commandOrder).toContain("horizontalRule");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL（commands/keymap 未导出）。

- [ ] **Step 3: 追加注册表与 keymap**

在 `markdownCommands.ts` 末尾追加：

```ts
// 命令注册表：id → 命令函数
export const commands: Record<string, Command> = {
  bold, italic, strikethrough, inlineCode, link,
  h1, h2, h3, quote, unorderedList, orderedList, taskList,
  codeBlock, insertTable, horizontalRule, indent, outdent,
};

// 工具栏分组顺序（UI 用；组间用 null 作分隔）
export const commandOrder: (string | null)[] = [
  "bold", "italic", "strikethrough", "inlineCode", null,
  "h1", "h2", "h3", null,
  "unorderedList", "orderedList", "taskList", null,
  "quote", "codeBlock", "horizontalRule", null,
  "link", "insertTable",
];

// 快捷键签名 → 命令 id（签名格式见文件顶部说明，基于 e.code）
export const keymap: Record<string, string> = {
  "mod+KeyB": "bold",
  "mod+KeyI": "italic",
  "mod+shift+KeyX": "strikethrough",
  "mod+KeyE": "inlineCode",
  "mod+KeyK": "link",
  "mod+alt+Digit1": "h1",
  "mod+alt+Digit2": "h2",
  "mod+alt+Digit3": "h3",
  "mod+alt+KeyQ": "quote",
  "mod+alt+KeyC": "codeBlock",
  "mod+shift+Digit8": "unorderedList",
  "mod+shift+Digit7": "orderedList",
  "mod+alt+KeyT": "taskList",
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/markdownCommands.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): 命令注册表 + 快捷键映射(keymap)"
```

---

## Task 8：runEdit — 把 Edit 写回 textarea（execCommand + fallback）

**Files:**
- Create: `apps/web/src/editor/runEdit.ts`
- Test: `apps/web/src/test/markdownCommands.test.ts`（新增 runEdit 用例）

> ADR-001：优先 `document.execCommand('insertText'/'delete')` 以保留原生 ⌘Z 撤销；jsdom/不支持时回退到「直接 onChange + setSelectionRange」（撤销栈折损但功能可用）。两路最终都把目标选区交给回调 `restoreSelection`，由组件在 `useLayoutEffect` 里还原（避开受控组件重渲染重置光标的时序问题）。

- [ ] **Step 1: 写失败测试（fallback 路径：jsdom 不支持 execCommand，走 onChange + restoreSelection）**

追加导入：`import { runEdit } from "../editor/runEdit";`，并在测试文件顶部加一个 jsdom 下可用的 textarea 工厂：

```ts
function makeTextarea(value: string, selStart: number, selEnd: number) {
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.selectionStart = selStart;
  ta.selectionEnd = selEnd;
  document.body.appendChild(ta);
  return ta;
}
```

追加测试：

```ts
describe("runEdit", () => {
  it("fallback：execCommand 不可用时，调 onChange 更新值并要求还原选区", () => {
    const ta = makeTextarea("x", 0, 1);
    let changed: string | undefined;
    let restored: { start: number; end: number } | undefined;
    runEdit(
      ta,
      { deleteStart: 0, deleteEnd: 1, insert: "y", selectStart: 1, selectEnd: 1 },
      { onChange: (v) => (changed = v), restoreSelection: (start, end) => (restored = { start, end }) }
    );
    expect(changed).toBe("y");
    expect(restored).toEqual({ start: 1, end: 1 });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: FAIL（runEdit 不存在）。

- [ ] **Step 3: 实现 runEdit.ts**

创建 `apps/web/src/editor/runEdit.ts`：

```ts
import type { Edit, EditorState } from "./types";
import { applyEdit } from "./types";

export interface RunEditCallbacks {
  onChange: (value: string) => void; // 更新受控 value
  restoreSelection: (start: number, end: number) => void; // 在 useLayoutEffect 里还原光标
}

// 把 Edit 写回 textarea：优先 execCommand（保撤销），否则回退到 onChange（功能保底）
export function runEdit(ta: HTMLTextAreaElement, edit: Edit, cb: RunEditCallbacks): void {
  const canExec =
    typeof document.execCommand === "function" &&
    document.execCommand("insertText", false, ""); // 能力探测

  if (canExec) {
    // 原生通道：DOM 更新会触发 input → React onChange，选区随后还原
    ta.focus();
    ta.setSelectionRange(edit.deleteStart, edit.deleteEnd);
    if (edit.deleteStart < edit.deleteEnd) {
      document.execCommand("delete");
    }
    if (edit.insert.length > 0) {
      document.execCommand("insertText", false, edit.insert);
    }
    cb.restoreSelection(edit.selectStart, edit.selectEnd);
    return;
  }

  // fallback：直接用纯函数算新值，交给 onChange；选区交给回调在重渲染后还原
  const prev: EditorState = {
    value: ta.value,
    selectionStart: ta.selectionStart,
    selectionEnd: ta.selectionEnd,
  };
  const next = applyEdit(prev, edit);
  cb.onChange(next.value);
  cb.restoreSelection(next.selectionStart, next.selectionEnd);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/markdownCommands.test.ts`
Expected: PASS（jsdom 下 execCommand 不可用 → 走 fallback 分支，断言成立）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/runEdit.ts apps/web/src/test/markdownCommands.test.ts
git commit -m "feat(web): runEdit 写回(execCommand 保撤销 + fallback)"
```

---

## Task 9：useEditorShortcuts — 快捷键 hook（IME guard + 分发 + ⌘S）

**Files:**
- Create: `apps/web/src/editor/useEditorShortcuts.ts`
- Test: `apps/web/src/test/useEditorShortcuts.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/test/useEditorShortcuts.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditorShortcuts } from "../editor/useEditorShortcuts";

function setup() {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const restoreSelection = vi.fn();
  const ta = document.createElement("textarea");
  ta.value = "x";
  ta.selectionStart = 0;
  ta.selectionEnd = 1;
  document.body.appendChild(ta);
  const { result } = renderHook(() =>
    useEditorShortcuts({ ref: { current: ta }, value: ta.value, onChange, onSave, restoreSelection })
  );
  return { ta, onChange, onSave, restoreSelection, onKeyDown: result.current };
}

describe("useEditorShortcuts", () => {
  it("IME 组合态不触发任何命令", async () => {
    const { ta, onChange } = setup();
    // 模拟输入法组字：先 compositionstart 再按键
    ta.dispatchEvent(new CompositionEvent("compositionstart"));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", metaKey: true, bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("⌘B 触发 bold（经 fallback 更新值）", async () => {
    const user = userEvent.setup();
    const { ta, onChange } = setup();
    ta.focus();
    await user.keyboard("{Meta>}");
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", metaKey: true, bubbles: true, cancelable: true }));
    expect(onChange).toHaveBeenCalledWith("**x**");
  });

  it("⌘S 调用 onSave 且 preventDefault", () => {
    const { ta, onSave } = setup();
    const ev = new KeyboardEvent("keydown", { key: "s", code: "KeyS", metaKey: true, bubbles: true, cancelable: true });
    const spy = vi.spyOn(ev, "preventDefault");
    ta.dispatchEvent(ev);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
  });

  it("Tab 触发 indent 且 preventDefault（焦点不跳走）", () => {
    const { ta, onChange } = setup();
    const ev = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true });
    const spy = vi.spyOn(ev, "preventDefault");
    ta.dispatchEvent(ev);
    expect(onChange).toHaveBeenCalledWith("  x");
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/useEditorShortcuts.test.tsx`
Expected: FAIL（hook 不存在）。

- [ ] **Step 3: 实现 useEditorShortcuts.ts**

创建 `apps/web/src/editor/useEditorShortcuts.ts`：

```ts
import { useCallback } from "react";
import { commands, keymap } from "./markdownCommands";
import { runEdit } from "./runEdit";
import type { Edit, EditorState } from "./types";

export interface ShortcutOptions {
  ref: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  restoreSelection: (start: number, end: number) => void;
}

// 由键盘事件生成 keymap 签名：mod+ / alt+ / shift+ 前缀 + e.code（见 markdownCommands 说明）
function signature(e: KeyboardEvent): string {
  const mod = e.metaKey || e.ctrlKey;
  const parts: string[] = [];
  if (mod) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(e.code);
  return parts.join("+");
}

export function useEditorShortcuts(opts: ShortcutOptions) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = opts.ref.current;
      if (!ta) return;

      // IME guard：输入法组合态一律放行，绝不拦截
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      const mod = e.metaKey || e.ctrlKey;

      // 立即保存：⌘S / Ctrl+S
      if (mod && e.code === "KeyS") {
        e.preventDefault();
        opts.onSave();
        return;
      }

      // Tab / Shift+Tab：缩进 / 反缩进
      if (e.code === "Tab") {
        e.preventDefault();
        const state: EditorState = { value: opts.value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd };
        const cmd = e.shiftKey ? commands["outdent"] : commands["indent"];
        runEdit(ta, cmd(state), { onChange: opts.onChange, restoreSelection: opts.restoreSelection });
        return;
      }

      // 其余组合查表
      if (mod) {
        const id = keymap[signature(e.nativeEvent)];
        if (id && commands[id]) {
          e.preventDefault();
          const state: EditorState = { value: opts.value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd };
          const edit: Edit = commands[id](state);
          runEdit(ta, edit, { onChange: opts.onChange, restoreSelection: opts.restoreSelection });
        }
      }
    },
    [opts]
  );

  return handleKeyDown;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/useEditorShortcuts.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/editor/useEditorShortcuts.ts apps/web/src/test/useEditorShortcuts.test.tsx
git commit -m "feat(web): useEditorShortcuts(IME guard + e.code 分发 + ⌘S)"
```

---

## Task 10：EditorToolbar 组件

**Files:**
- Create: `apps/web/src/components/EditorToolbar.tsx`
- Test: `apps/web/src/test/EditorToolbar.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/test/EditorToolbar.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorToolbar } from "../components/EditorToolbar";

describe("EditorToolbar", () => {
  it("渲染全部命令按钮（按 commandOrder）", () => {
    render(<EditorToolbar onCommand={() => {}} />);
    expect(screen.getByTitle(/加粗/)).toBeInTheDocument();
    expect(screen.getByTitle(/表格/)).toBeInTheDocument();
  });

  it("点击加粗按钮 → 调用 onCommand('bold')", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} />);
    await user.click(screen.getByTitle(/加粗/));
    expect(onCommand).toHaveBeenCalledWith("bold");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/EditorToolbar.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现 EditorToolbar.tsx**

创建 `apps/web/src/components/EditorToolbar.tsx`：

```tsx
import { commandOrder, keymap } from "../editor/markdownCommands";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Code2, Minus, Link, Image, Table,
} from "lucide-react";

// 命令 id → 图标 + 中文标题（含快捷键提示）
const meta: Record<string, { icon: React.ReactNode; label: string }> = {
  bold: { icon: <Bold className="w-[18px] h-[18px]" />, label: "加粗" },
  italic: { icon: <Italic className="w-[18px] h-[18px]" />, label: "斜体" },
  strikethrough: { icon: <Strikethrough className="w-[18px] h-[18px]" />, label: "删除线" },
  inlineCode: { icon: <Code className="w-[18px] h-[18px]" />, label: "行内代码" },
  h1: { icon: <Heading1 className="w-[18px] h-[18px]" />, label: "H1 标题" },
  h2: { icon: <Heading2 className="w-[18px] h-[18px]" />, label: "H2 标题" },
  h3: { icon: <Heading3 className="w-[18px] h-[18px]" />, label: "H3 标题" },
  unorderedList: { icon: <List className="w-[18px] h-[18px]" />, label: "无序列表" },
  orderedList: { icon: <ListOrdered className="w-[18px] h-[18px]" />, label: "有序列表" },
  taskList: { icon: <ListChecks className="w-[18px] h-[18px]" />, label: "任务列表" },
  quote: { icon: <Quote className="w-[18px] h-[18px]" />, label: "引用" },
  codeBlock: { icon: <Code2 className="w-[18px] h-[18px]" />, label: "代码块" },
  horizontalRule: { icon: <Minus className="w-[18px] h-[18px]" />, label: "分割线" },
  link: { icon: <Link className="w-[18px] h-[18px]" />, label: "链接" },
  insertTable: { icon: <Table className="w-[18px] h-[18px]" />, label: "表格" },
};

// 反查 keymap：命令 id → 可读快捷键
const shortcutFor: Record<string, string> = Object.entries(keymap).reduce(
  (acc, [sig, id]) => {
    const pretty = sig
      .replace("mod+", "⌘/")
      .replace("alt+", "⌥/")
      .replace("shift+", "⇧/")
      .replace("Key", "")
      .replace("Digit", "");
    acc[id] = pretty;
    return acc;
  },
  {} as Record<string, string>
);

interface Props {
  onCommand: (id: string) => void;
}

export function EditorToolbar({ onCommand }: Props) {
  return (
    <div className="flex items-center gap-0.5 px-4 h-10 border-b border-outline-variant bg-white overflow-x-auto sticky top-12 z-10">
      {commandOrder.map((id, i) =>
        id === null ? (
          <div key={`sep-${i}`} className="h-6 w-px bg-outline-variant mx-1 shrink-0" />
        ) : (
          <button
            key={id}
            type="button"
            title={`${meta[id].label}${shortcutFor[id] ? "  " + shortcutFor[id] : ""}`}
            onClick={() => onCommand(id)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-on-surface hover:bg-surface-container-low transition-colors shrink-0"
          >
            {meta[id].icon}
          </button>
        )
      )}
    </div>
  );
}

export default EditorToolbar;
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/EditorToolbar.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/EditorToolbar.tsx apps/web/src/test/EditorToolbar.test.tsx
git commit -m "feat(web): EditorToolbar 顶部常驻工具栏"
```

---

## Task 11：接入 MarkdownSplit（ref + 选区还原 + 工具栏 + hook）

**Files:**
- Modify: `apps/web/src/components/MarkdownSplit.tsx`
- Test: `apps/web/src/test/MarkdownSplit.test.tsx`

- [ ] **Step 1: 写失败测试（点工具栏加粗 → 调用 onChange 且值为 **x**）**

在 `MarkdownSplit.test.tsx` 追加：

```tsx
import userEvent from "@testing-library/user-event";

it("点工具栏加粗按钮 → onChange 收到 **x**", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { container } = render(<MarkdownSplit value="x" onChange={onChange} />);
  const ta = container.querySelector("textarea")!;
  ta.focus();
  ta.selectionStart = 0;
  ta.selectionEnd = 1;
  await user.click(container.querySelector('button[title*="加粗"]')!);
  expect(onChange).toHaveBeenCalledWith("**x**");
});
```

（顶部已 `import { describe, it, expect, vi } from "vitest"`；若没有 `vi`，补上。）

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter web test -- --run src/test/MarkdownSplit.test.tsx`
Expected: FAIL（工具栏尚未挂载）。

- [ ] **Step 3: 改造 MarkdownSplit.tsx**

将 `apps/web/src/components/MarkdownSplit.tsx` 整体替换为：

```tsx
// Markdown 分栏：左侧 textarea 源码，右侧 react-markdown 实时预览（prose 排版，含 GFM）
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import EditorToolbar from "./EditorToolbar";
import { commands } from "../editor/markdownCommands";
import { runEdit } from "../editor/runEdit";
import { useEditorShortcuts } from "../editor/useEditorShortcuts";
import type { EditorState } from "../editor/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void; // ⌘S 立即保存（可选）
}

export default function MarkdownSplit({ value, onChange, onSave }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number } | null>(null);

  // 还原光标：在 value 变更提交后（useLayoutEffect 时机）把选区设回目标位置
  useEffect(() => {
    if (pendingSel && ref.current) {
      ref.current.setSelectionRange(pendingSel.start, pendingSel.end);
      setPendingSel(null);
    }
  }, [value, pendingSel]);

  const restoreSelection = (start: number, end: number) => setPendingSel({ start, end });

  const handleKeyDown = useEditorShortcuts({
    ref,
    value,
    onChange,
    onSave: onSave ?? (() => {}),
    restoreSelection,
  });

  // 工具栏点击：用当前 DOM 选区构造 EditorState，执行命令后写回
  const handleCommand = (id: string) => {
    const ta = ref.current;
    if (!ta) return;
    const fn = commands[id];
    if (!fn) return;
    const state: EditorState = { value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd };
    runEdit(ta, fn(state), { onChange, restoreSelection });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <EditorToolbar onCommand={handleCommand} />
      <div className="flex-1 min-h-0 flex">
        {/* 源码区 */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用 Markdown 书写…"
          className="flex-1 min-w-0 resize-none border-none outline-none p-8 font-mono text-sm leading-7 text-on-surface bg-white placeholder:text-outline-variant placeholder:italic"
        />
        {/* 预览区：为空时显示占位提示，避免空白 */}
        <div className="w-2/5 shrink-0 min-w-0 overflow-y-auto border-l border-outline-variant/30 bg-surface-container-low/30 p-8">
          {value ? (
            <div className="prose prose-slate max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-outline-variant italic text-sm">预览区</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter web test -- --run src/test/MarkdownSplit.test.tsx`
Expected: PASS（含 Task 1 的 GFM 用例与本任务工具栏用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/MarkdownSplit.tsx apps/web/src/test/MarkdownSplit.test.tsx
git commit -m "feat(web): MarkdownSplit 接入工具栏/快捷键/选区还原"
```

---

## Task 12：接入 NoteEditor（⌘S 立即保存）

**Files:**
- Modify: `apps/web/src/components/NoteEditor.tsx`

- [ ] **Step 1: 定位现状**

阅读 `apps/web/src/components/NoteEditor.tsx:14-50`：`content` 本地状态 + `timer`（1500ms 防抖 autosave）+ `dirty.current`。`MarkdownSplit` 在 `:137` 处渲染为 `<MarkdownSplit value={content} onChange={...} />`。

- [ ] **Step 2: 增加 force-flush 保存函数**

在 `NoteEditor.tsx` 内 autosave 的 `useEffect` 附近，新增（注释中文）：

```tsx
// 立即保存：跳过 1500ms 防抖，强制 flush 当前内容
const saveNow = () => {
  if (!note) return;
  if (timer.current) {
    clearTimeout(timer.current);
    timer.current = null;
  }
  if (!dirty.current) return; // 无改动则不重复请求
  updateNote.mutate({
    id: note.id,
    payload: { title, content, tag_ids: tagIds, is_protected: protected_ },
  });
  dirty.current = false;
};
```

- [ ] **Step 3: 把 saveNow 透传给 MarkdownSplit**

将 `:137` 的 `<MarkdownSplit value={content} onChange={...} />` 改为：

```tsx
<MarkdownSplit value={content} onChange={handleChange} onSave={saveNow} />
```

（`handleChange` 为现有写入 `content` 并启动防抖的函数；若现在用的是内联 `(e)=>{...}`，提取为 `handleChange` 以保持 DRY。）

- [ ] **Step 4: 手动验证 ⌘S**

Run: `pnpm --filter web dev`
- 编辑正文 → 立即按 `⌘S` → 观察网络面板：`PUT /api/notes/{id}` 立即发出（不等 1500ms）；浏览器「保存网页」弹窗**不**出现。
- 验证后停止 dev。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/NoteEditor.tsx
git commit -m "feat(web): ⌘S 立即保存(force flush)"
```

---

## Task 13：全量测试 + 端到端回归

**Files:**
- 无新增；运行全部测试 + 浏览器回归

- [ ] **Step 1: 跑全部单测**

Run: `pnpm --filter web test -- --run`
Expected: 全绿。

- [ ] **Step 2: 类型检查 + 构建**

Run: `pnpm --filter web build`
Expected: `tsc -b` 与 `vite build` 均无错。

- [ ] **Step 3: 浏览器端到端回归（手动）**

Run: `pnpm --filter web dev`，逐项验证：

| 验证项 | 期望 |
| --- | --- |
| 工具栏点击加粗（无选中） | 插入 `**\|**`，光标居中 |
| 选中文字点加粗 | 包裹为 `**x**`；再点一次去包裹 |
| `⌘B / ⌘I / ⌘K / ⌘E` | 分别加粗/斜体/链接/行内代码 |
| `⌘Alt+1/2/3` | 设/切 H1/H2/H3 |
| `⌘Shift+7 / ⌘Shift+8` | 有序 / 无序列表 |
| `⌘Alt+T` | 任务列表三态切换 |
| `Tab` / `Shift+Tab` | 缩进 / 反缩进；列表项降级/升级；焦点不跳走 |
| `⌘S` | 立即保存，无浏览器保存弹窗 |
| 中文输入法组字时按上述快捷键 | 不触发命令、不吞输入 |
| `⌘Z` | 能逐字/逐动作回退（execCommand 路线） |
| 删除线/任务列表/表格 | 右侧预览正确渲染（remark-gfm） |

- [ ] **Step 4: 提交（若回归中发现并修复了小问题）**

如本步无代码改动则跳过；否则：

```bash
git add -A
git commit -m "fix(web): 编辑器工具栏/快捷键回归修复"
```

---

## 自审（Self-Review）

**1. Spec 覆盖：**
- 工具栏（14 按钮）→ Task 10 + Task 7 `commandOrder`。✓
- 快捷键完整表 → Task 7 `keymap` + Task 9 分发。✓
- 行内包裹 toggle / 无选中居中 → Task 3。✓
- 行首前缀多行 toggle / 任务三态 → Task 4。✓
- 块命令（代码块/表格/分割线）→ Task 5。✓
- Tab 缩进/列表升降级 → Task 6。✓
- `remark-gfm` → Task 1。✓
- IME guard → Task 9（`isComposing`/`keyCode===229`）。✓
- 撤销保留（ADR-001 execCommand）→ Task 8。✓
- 光标还原（受控组件时序）→ Task 11 `pendingSel` + `useEffect`。✓
- `⌘S` 立即保存 → Task 12。✓
- 测试覆盖 → Tasks 1–11 各含测试，Task 13 全量回归。✓
- 不做项（智能续行/浮动工具栏/移动端/换内核）→ 计划中无对应任务，符合 YAGNI。✓

**2. 占位符扫描：** 无 TBD/TODO；每个代码步均含完整可运行代码。✓

**3. 类型一致性：** `EditorState`/`Edit`/`Command` 在 Task 2 定义，Tasks 3–9 沿用同一签名；`commands`/`keymap`/`commandOrder` 在 Task 7 导出，Tasks 9/10/11 消费一致；`runEdit` 回调 `{onChange, restoreSelection}` 在 Task 8 定义、Tasks 9/11 一致调用。✓
