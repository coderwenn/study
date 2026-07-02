# 编辑区 Markdown 工具栏与快捷键 — 设计文档

- 日期：2026-07-02
- 拟定分支：`feat-editor-toolbar`
- 涉及代码：`apps/web/src/components/MarkdownSplit.tsx`、`apps/web/src/components/NoteEditor.tsx`，新增 `apps/web/src/editor/markdownCommands.ts`、`apps/web/src/editor/useEditorShortcuts.ts`、`apps/web/src/components/EditorToolbar.tsx`（仅前端）

## 1. 背景与目标

当前笔记正文是一个**受控的纯 `<textarea>`** + `react-markdown` 实时分屏预览（`MarkdownSplit.tsx`），编辑区**没有任何格式工具栏**、**没有任何键盘快捷键**，textarea 也没有 `ref`、不跟踪选区（`selectionStart/End`）。

目标：在不更换编辑器内核（保留 textarea）的前提下，让正文编辑区的操作**更贴近主流 Markdown 编辑器（Obsidian 源码模式 / VSCode 风格）**：

- 顶部常驻一条**格式工具栏**，点击即对选区/当前行插入或切换 Markdown 语法。
- 一套**浏览器保留键安全**的快捷键，覆盖高频格式操作。
- `Tab`/`Shift+Tab` 用于缩进与列表升降级。
- 中文输入法（IME）组合态不被快捷键误触发。
- 工具栏/快捷键操作后，光标恢复到语义正确的位置，且 `⌘Z` 原生撤销仍然有效。

## 2. 范围

### 2.1 做（in scope）

- 工具栏组件 + 快捷键 hook + 纯函数命令集。
- 核心 CommonMark 格式：加粗 / 斜体 / 行内代码 / 链接 / 图片 / H1–H3 / 引用 / 有序列表 / 无序列表 / 代码块 / 分割线。
- GFM 扩展格式：删除线 `~~`、任务列表 `- [ ]`、表格（按钮以「插入表格模板」形式提供）。
- `Tab` 缩进 / `Shift+Tab` 反缩进；列表项内 `Tab`/`Shift+Tab` 降级/升级。
- `⌘S`（`Ctrl+S`）强制立即保存。
- 预览开启 `remark-gfm`，使 GFM 语法能在右侧渲染。

### 2.2 不做（out of scope / YAGNI）

- **不换编辑器内核**（不引入 CodeMirror / TipTap / ProseMirror 等），不做 Typora 式实时渲染、不做 Notion 式块编辑。
- **不做智能续行**：回车在列表项内自动续出下一项 / 数字列表自增 —— 这是本需求里最易出 bug 的部分（与 IME、原生 Enter 行为耦合），**推迟到 v2**。
- 不做浮动选区工具栏（仅顶部常驻）。
- 不做专门移动端适配（桌面优先，窄屏工具栏横向滚动/折叠即可）。
- 不做查找替换（`⌘F` 留给浏览器原生）。
- 不改后端接口、不改 `content` 数据模型、不改 autosave 机制。

## 3. 现状回顾（相关代码）

- `MarkdownSplit.tsx`：左侧 `<textarea value={value} onChange={...}>`（无 ref、无 `onKeyDown`），右侧 `<ReactMarkdown>` 渲染进 `prose prose-slate` 容器。
- `NoteEditor.tsx:14-50`：本地状态 `title/content/tagIds/protected_`；`content: string`；切换笔记时 `useEffect` 覆盖本地状态；防抖 1500ms autosave（`dirty.current` 为真才发），`updateNote.mutate({ id, payload: { title, content, tag_ids, is_protected } })`。
- 依赖：`react-markdown` ^10.1.0；**未安装** `remark-gfm`、未安装任何 hotkeys 库；图标库 `lucide-react`。
- 样式：Tailwind 3，**仅 utility class、不写自定义 class**（见 `CLAUDE.md`；`index.css` 的 `.switch*` 是全仓唯一例外）。主题色 `primary #2563eb`、`outline-variant`、`surface-container-low` 等。
- 现有 header 样式（`NoteEditor.tsx:96`）：`sticky top-0 bg-white z-10 h-12 border-b`，按钮模板见 `NoteEditor.tsx:108`，分隔线 `<div className="h-6 w-px bg-outline-variant mx-1" />`。
- 测试：`apps/web/src/test/*.test.tsx`，`vitest.config.ts` 已存在，已装 `@testing-library/react` + `@testing-library/user-event` + `jsdom`。

## 4. 设计

### 4.1 新增依赖

- `remark-gfm`：接在 `react-markdown` 的 `remarkPlugins={[remarkGfm]}`，使删除线 / 任务列表 / 表格在预览区可渲染（否则工具栏点了语法右侧也显示不出来）。

### 4.2 文件结构（3 新 + 2 改）

| 文件 | 职责 | 备注 |
| --- | --- | --- |
| `src/editor/markdownCommands.ts` | **纯函数命令集**，不依赖 DOM/React | 输入 `EditorState` → 输出 `EditorState`；可单测 |
| `src/editor/useEditorShortcuts.ts` | 快捷键分发 hook | 绑定 textarea 的 `onKeyDown`；IME guard；命中即 `preventDefault` + 执行命令 |
| `src/components/EditorToolbar.tsx` | 顶部常驻工具栏组件 | sticky；`lucide-react` 图标；纯 Tailwind utility |
| `src/components/MarkdownSplit.tsx`（改） | 接入 ref + 选区 | 加 `useRef<HTMLTextAreaElement>`、选区状态，串起工具栏与 hook |
| `src/components/NoteEditor.tsx`（改） | 接入「立即保存」 | `⌘S` 回调走现有 autosave flush；工具栏挂载点 |

> **为何把命令做成纯函数**：与 DOM/React 解耦，命令的输入输出就是「字符串 + 选区」的纯变换，测试只需断言字符串进出，不必渲染组件或模拟事件。快捷键 hook 与工具栏共用同一份命令实现，单一事实源。

### 4.3 命令模型（`markdownCommands.ts`）

```ts
// 编辑器内容 + 选区的不可变快照
export interface EditorState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}
// 命令：纯函数，输入快照 → 输出新快照（不碰 DOM）
export type MarkdownCommand = (s: EditorState) => EditorState;
```

命令分三类：

1. **行内包裹类（toggle，对选区成对加/去标记）**：`bold`(`**`)、`italic`(`*`)、`strikethrough`(`~~`)、`inlineCode`(`` ` ``)、`link`(`[text](url)`)。
   - 已包裹 → 去包裹（toggle）；未包裹 → 包裹。
   - 无选中 → 插入空标记并把光标放中间（如 `**|**`）。
2. **行首前缀类（对选区涉及的每一行 toggle 前缀）**：`h1`(`# `)、`h2`(`## `)、`h3`(`### `)、`quote`(`> `)、`unorderedList`(`- `)、`orderedList`(`1. `)、`taskList`(`- [ ]`，再次触发转 `- [x]`，第三次去除)。
3. **块/缩进类**：`codeBlock`(选区外包 ```` ``` ```` 围栏)、`insertTable`(插入 2×2 表格模板)、`indent`(每行 +2 空格；列表项内即降级)、`outdent`(每行去最多 2 个前导空格；列表项内即升级)。

> 「立即保存」`save` 不在此文件内：它需要触达 autosave，不属于纯字符串变换。它由 hook 识别 `⌘S` 后调用传入的 `onSave` 回调实现。

### 4.4 快捷键 hook（`useEditorShortcuts.ts`）

- 入参：textarea `ref`、`onChange(newValue)`、`onSave()`。
- `onKeyDown` 处理顺序：
  1. **IME guard**：`if (e.nativeEvent.isComposing || e.keyCode === 229) return;` —— 中文输入法组合态一律放行，绝不拦截。
  2. `Tab` / `Shift+Tab` → `indent` / `outdent`（`preventDefault`，避免焦点跳走）。
  3. 其余组合查表：`mod = e.metaKey || e.ctrlKey`；命中 `(mod, altKey, shiftKey, key)` → `preventDefault` + 执行对应命令。
  4. `⌘S` → `preventDefault`（拦截浏览器「保存网页」）+ 调 `onSave()`。
- 执行命令后：用结果值驱动 `onChange`，并在下一帧 `textarea.setSelectionRange(start, end)` 还原光标。

### 4.5 工具栏（`EditorToolbar.tsx`）

- 位置：`MarkdownSplit` 顶部、现有 header 之下，一条 `sticky` 工具栏，复用现有 header 的边框/留白风格。
- 布局（约 14 按钮 + 分隔线，窄屏横向滚动）：
  `[B 加粗][I 斜体][S 删除线][</> 行内代码] │ [H1][H2][H3] │ [• 无序][1. 有序][☑ 任务] │ [❝ 引用][``` 代码块][─ 分割线] │ [🔗 链接][🖼 图片][▦ 表格]`
- 每个按钮：`lucide-react` 图标 + `title`（显示快捷键提示）；点击调用对应命令，光标逻辑同快捷键。
- 样式仅 Tailwind utility：按钮参考 `NoteEditor.tsx:108` 模板，hover `bg-surface-container-low`。

### 4.6 数据流

工具栏点击 / 快捷键 → 命令纯函数算出 `{value, selStart, selEnd}` → `setContent(value)` 触发现有 `onChange` → autosave 防抖 1500ms 照常 → `setSelectionRange` 还原光标。`⌘S` 走 `onSave` 强制 flush。

## 5. 快捷键表（浏览器保留键安全）

刻意避开：`⌘L`(地址栏)、`⌘T`/`⌘W`/`⌘N`(标签/窗口)、`⌘1..9`(切标签)、`⌘F`(查找)、`⌘P`(打印)。Windows/Linux 上 `⌘` = `Ctrl`。

| 动作 | 快捷键 | | 动作 | 快捷键 |
| --- | --- | --- | --- | --- |
| 加粗 | `⌘B` | | H1 / H2 / H3 | `⌘Alt+1` / `2` / `3` |
| 斜体 | `⌘I` | | 引用 | `⌘Alt+Q` |
| 删除线 (GFM) | `⌘Shift+X` | | 代码块 | `⌘Alt+C` |
| 行内代码 | `⌘E` | | 无序 / 有序列表 | `⌘Shift+8` / `⌘Shift+7` |
| 链接 | `⌘K` | | 任务列表 (GFM) | `⌘Alt+T` |
| 缩进 / 列表降级 | `Tab` | | 反缩进 / 列表升级 | `Shift+Tab` |
| 立即保存 | `⌘S` | | | |

## 6. 文本插入与撤销路线

详见 **ADR-001**（同目录 `2026-07-02-editor-toolbar-shortcuts-adr-001.md`）。结论：命令执行通过 `document.execCommand('insertText'/'delete')` 落盘，以**保留浏览器原生 `⌘Z` 逐字撤销**；该命令纯函数返回的选区用于操作后还原光标。

## 7. 边界情况

| 场景 | 行为 |
| --- | --- |
| 中文 IME 组合态（如输入拼音） | `isComposing` 为真时快捷键全部放行，不拦截、不插入 |
| 无选区点「加粗」 | 插入 `**\|**`，光标居中 |
| 选区已是 `**粗**` 再按加粗 | 去包裹（toggle） |
| 行首命令跨多行选区 | 对每一行分别 toggle 前缀 |
| 列表项内按 `Tab` | 行首 +2 空格 → 降级为子列表；`Shift+Tab` 去 2 空格 → 升级 |
| 普通行按 `Tab`（无列表） | 选区多行 → 每行 +2 空格；单点 → 光标处插 2 空格 |
| `⌘S` | 拦截浏览器保存网页；立即 flush autosave；给轻量反馈（如按钮短暂高亮/toast） |
| 原生 `⌘Z` | 因走 `execCommand` 路线，逐字撤销仍然有效 |
| 工具栏操作后光标 | `setSelectionRange` 还原到语义位置（包裹类置于标记内/后、行首类置于行首） |
| 窄屏 | 工具栏横向滚动，不溢出破坏布局 |

## 8. 测试

`apps/web/src/test/` 下新增：

1. `markdownCommands.test.ts`（纯函数，重点覆盖）：
   - 行内包裹：有选区包裹 / 已包裹去包裹（toggle）/ 无选区插入空标记并定位光标。
   - 行首前缀：单行 toggle、多行选区逐行 toggle、已存在前缀去除、任务列表三态循环（` `→`x`→去除）。
   - 缩进：普通行 +2、列表项降级、多行块缩进、`outdent` 去前导空格上限 2。
2. `useEditorShortcuts.test.tsx`：
   - IME 组合态（`isComposing`）不触发任何命令。
   - `⌘B`/`⌘I`/`⌘K`/`⌘E` 命中并 `preventDefault`。
   - `Tab`/`Shift+Tab` 缩进且 `preventDefault`（焦点不跳走）。
   - `⌘S` 调用 `onSave` 且 `preventDefault`。
3. `EditorToolbar.test.tsx`：渲染全部按钮、点击按钮触发对应命令。

## 9. 术语表（Glossary）

| 术语 | 含义 |
| --- | --- |
| 源码模式（source mode） | 直接编辑 Markdown 源文本（带 `#`、`**` 等标记），右侧分屏实时预览渲染结果。本方案的目标编辑模型。 |
| 工具栏（toolbar） | 编辑区顶部常驻的格式按钮条，点击对选区/当前行应用命令。 |
| 命令（command） | 一个对 `EditorState` 的纯函数变换（如「加粗」「设为 H1」），工具栏与快捷键共用。 |
| 快捷键（shortcut / hotkey） | 修饰键组合（如 `⌘B`）触发的命令绑定。 |
| EditorState | 编辑器在某时刻的不可变快照：`{ value, selectionStart, selectionEnd }`。命令的输入输出。 |
| 行内包裹类命令 | 成对标记包裹选区的命令（加粗/斜体/删除线/行内代码/链接），支持 toggle。 |
| 行首前缀类命令 | 对选区涉及的每一行加/去行首标记的命令（标题/引用/列表/任务）。 |
| 列表升降级 | `Tab` 给列表项加 2 空格降为子列表，`Shift+Tab` 去空格升回上一级。 |
| GFM | GitHub Flavored Markdown，提供删除线、任务列表、表格等扩展语法。需 `remark-gfm` 才能在预览渲染。 |
| IME 组合态（composing） | 输入法正在组字（如拼音未上屏）的状态；此态下快捷键必须放行，见 IME guard。 |
| IME guard | `isComposing === true`（或 `keyCode === 229`）时跳过快捷键处理的守卫。 |
| 立即保存（force flush） | `⌘S` 跳过 1500ms 防抖、立即触发一次 autosave。 |
| toggle | 同一命令再次执行时撤销自身效果（如已加粗再按加粗 → 取消加粗）。 |

## 10. 风险

- **IME 误触发**：靠 `isComposing` guard 兜底，并在测试中显式覆盖。
- **撤销体验**：取决于 ADR-001 选择的路线；当前选 `execCommand` 路线，原生逐字撤销可用，API 废弃风险短期内可控，备选回退见 ADR。
- **`remark-gfm` 接入**：可能微调现有预览渲染（如表格样式），需回归现有笔记预览。
