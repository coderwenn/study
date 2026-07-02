# ADR-001：编辑器文本插入与撤销的技术路线

- 日期：2026-07-02
- 状态：已采纳（Accepted）
- 关联设计：`2026-07-02-editor-toolbar-shortcuts-design.md`

## 背景

工具栏按钮与快捷键需要对 textarea 的文本/选区做受控修改（包裹 `**`、行首加 `# `、块缩进等）。技术上「如何把命令算出的新文本写回 textarea」有三种可选路线，它们在**撤销体验**与**实现成本/未来风险**上互有取舍。撤销体验是核心矛盾——用户期望 `⌘Z` 能像平时一样逐字回退，而不是一次跳过整条命令。

命令纯函数（`markdownCommands.ts`）只负责算出 `{ value, selectionStart, selectionEnd }`，**不决定**写回方式；写回方式由本 ADR 统一裁定，所有命令共用。

## 决策

采用**路线 A：`document.execCommand('insertText' / 'delete')`** 写回 textarea。

- 删除当前选区：`document.execCommand('delete')`。
- 在光标处插入文本：`document.execCommand('insertText', false, text)`。
- 命令纯函数算出的新选区，在写回后用 `textarea.setSelectionRange(start, end)` 还原光标。
- 该 API 走浏览器原生的「可编辑文本输入」通道，**会进入 textarea 的原生撤销栈**，因此 `⌘Z` 仍可逐字/逐动作回退。

执行顺序（每个命令）：纯函数算 diff → 必要时 `execCommand('delete')` 删去旧片段 → `execCommand('insertText', false, 新片段)` → `setSelectionRange` 还原。

## 备选方案

### 路线 B：重设 React state + `setSelectionRange`

直接 `setContent(newValue)`（走现有受控 `value`/`onChange`），再用 `setSelectionRange` 还原光标。

- 优点：实现最简单、完全可控、不依赖任何 deprecated API。
- 缺点：**破坏原生撤销栈**——React 重设 `value` 会被浏览器视为一次整体覆盖，`⌘Z` 会一次跳过整条命令（甚至跳过更多），逐字撤销失效。若要补回体验，需自建 undo/redo 栈并自行接管 `⌘Z`/`⌘Shift+Z`，复杂度与出错面显著上升。

### 路线 C：派发原生 `InputEvent`

构造并 `dispatchEvent` 一个 `InputEvent`（`inputType: 'insertText'` / `'insertFromText'` 等）。

- 优点：最现代、理论上保留撤销栈、不依赖 deprecated API。
- 缺点：跨浏览器对「可信任 (trusted) 合成 InputEvent」与撤销栈的整合行为不完全一致；实现更繁、调试成本高；对当前需求收益有限。

## 后果

- 正面：撤销体验与用户在普通 textarea 中的肌肉记忆一致；命令实现与写回方式解耦，纯函数保持可测。
- 负面：`document.execCommand` 已被规范标记为 deprecated，存在**长期**被移除/行为变更的风险。
- 风险缓释：
  - 写回逻辑集中在一处（建议 `editor/applyCommand.ts` 的单一函数），未来若浏览器移除该 API，仅需把该函数内部切换到路线 C，命令纯函数与上层 UI 无需改动。
  - 用能力检测包裹：若 `execCommand('insertText')` 返回 `false` 或抛错，回退到路线 B（接受撤销栈折损），保证功能不中断。
  - 在回归测试中显式覆盖「插入后 `⌘Z` 能回退」这一行为契约。

## 备注

`execCommand` 在 Chromium / WebKit 系（Chrome、Edge、Safari）下 `insertText` 支持良好，覆盖了本笔记应用的目标用户群。Firefox 对 `insertText` 的撤销栈整合略有差异，回退策略（见上）用于兜底。
