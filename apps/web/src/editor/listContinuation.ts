import type { Edit, EditorState } from "./types";

// Enter 续前缀的核心逻辑：判断光标当前行的前缀类型，决定下一行要插入什么。
//
// 设计取舍：
// - 方案 A：续行前缀 = 当前光标所在行的前缀（不是「最近一次命令」），与 Typora 一致。
// - 单 Enter 即换行（配合 remark-breaks，单 \n 渲染为 <br>），不再要求「两个空格 + 回车」。
//
// 不续前缀的场景：
// - 标题（### xxx）：标题是块级元素，回车应回到正文（主流行为）。
// - 代码围栏（``` / ~~~ 之间）：代码块内容是字面量，绝不能加前缀。
// - 普通段落：不续。
//
// 特殊行为：
// - 空列表项退出：当光标所在行只有前缀（如 "- "、"1. "）没有内容时，回车 = 删除该前缀，
//   退出列表回到正文（与 Typora/语雀一致），避免无限产生空列表项。
// - 有序列表递增：读当前行数字 N，新行 = (N+1) + ". "。
// - 任务列表：新行始终重置为未勾选 "- [ ] "（即使上一行是 "- [x]"）。
// - 缩进子列表：保留前导空白层级（如 "  - " → "  - "）。
// - 多行选区：选中区域整体被替换为一个换行（不逐行续前缀，主流行为）。

// 匹配无序列表前缀：捕获组1 = 前导空白，组2 = 标记符（- * +）
const unorderedRe = /^(\s*)([-*+])\s+(.*)$/;
// 匹配有序列表前缀：捕获组1 = 前导空白，组2 = 数字，组3 = 标记符（. 或 )）
const orderedRe = /^(\s*)(\d+)([.)])\s+(.*)$/;
// 匹配任务列表前缀：捕获组1 = 前导空白，组2 = 勾选符（" " 或 "x"）
const taskRe = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
// 匹配引用前缀
const quoteRe = /^(\s*)>\s?(.*)$/;
// 匹配纯前缀（空内容，用于「空项退出」判定）
const emptyUnorderedRe = /^(\s*)([-*+])\s*$/;
const emptyOrderedRe = /^(\s*)(\d+)([.)])\s*$/;
const emptyTaskRe = /^(\s*)([-*+])\s+\[[ xX]\]\s*$/;
const emptyQuoteRe = /^(\s*)>\s?$/;

// 代码围栏围栏行：```lang 或 ~~~（前后可有空白）
const fenceRe = /^\s*(`{3,}|~{3,})/;
// 检测全文里光标是否落在代码围栏内部
function isInsideCodeFence(value: string, cursor: number): boolean {
  const before = value.slice(0, cursor);
  // 找最后一个换行边界以确定光标所在行起点；这里只需逐行扫描到光标所在行
  let fence: string | null = null; // 当前生效的围栏字符（` 或 ~）；null 表示不在围栏内
  const lines = before.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fenceRe);
    if (m) {
      const mark = m[1][0];
      if (fence === null) {
        // 开启围栏
        fence = mark;
      } else if (mark === fence && m[1].length >= 3) {
        // 关闭围栏（同种标记且长度 >=3）
        fence = null;
      }
    }
  }
  return fence !== null;
}

// 取光标所在行的起点偏移
function lineStart(value: string, cursor: number): number {
  const i = value.lastIndexOf("\n", cursor - 1);
  return i + 1; // -1 → 0
}

// 计算下一行应插入的前缀（含换行符前导的 \n）。
// 返回 null 表示「不续前缀，只插 \n」。
// 返回 "" 表示「空项退出：删除当前行前缀，回到正文」（特殊：deleteStart/end 已指向当前行前缀）。
// 返回 "xxx" 表示「下一行插入 \nxxx」。
function nextPrefix(currentLine: string): { kind: "none" | "exit" | "continue"; prefix: string; exitRange?: { start: number; end: number } } {
  // 任务列表（先于无序检测，避免被 unorderedRe 误吞）
  const task = currentLine.match(taskRe);
  if (task) {
    const [, indent, mark /* checked */] = task;
    // 任务列表：空内容 → 退出
    if (emptyTaskRe.test(currentLine)) {
      return { kind: "exit", prefix: "" };
    }
    // 续行：保留缩进 + 标记 + 未勾选
    return { kind: "continue", prefix: `${indent}${mark} [ ] ` };
  }
  // 无序列表
  const ul = currentLine.match(unorderedRe);
  if (ul) {
    const [, indent, mark] = ul;
    if (emptyUnorderedRe.test(currentLine)) {
      return { kind: "exit", prefix: "" };
    }
    return { kind: "continue", prefix: `${indent}${mark} ` };
  }
  // 有序列表（递增）
  const ol = currentLine.match(orderedRe);
  if (ol) {
    const [, indent, num, delim] = ol;
    if (emptyOrderedRe.test(currentLine)) {
      return { kind: "exit", prefix: "" };
    }
    const next = parseInt(num, 10) + 1;
    return { kind: "continue", prefix: `${indent}${next}${delim} ` };
  }
  // 引用
  const qt = currentLine.match(quoteRe);
  if (qt) {
    const [, indent /* content */] = qt;
    if (emptyQuoteRe.test(currentLine)) {
      return { kind: "exit", prefix: "" };
    }
    return { kind: "continue", prefix: `${indent}> ` };
  }
  // 标题、代码块、普通行：不续
  return { kind: "none", prefix: "" };
}

// Enter 键的纯函数实现：输入 EditorState → 输出 Edit
export function computeEnterEdit(s: EditorState): Edit {
  const { value, selectionStart: selStart, selectionEnd: selEnd } = s;

  // 多行选区：选中区域整体被替换为一个换行（不续前缀，主流行为）
  const hasSelection = selEnd > selStart;
  if (hasSelection) {
    return {
      deleteStart: selStart,
      deleteEnd: selEnd,
      insert: "\n",
      selectStart: selStart + 1,
      selectEnd: selStart + 1,
    };
  }

  // 代码围栏内：普通换行，不续前缀
  if (isInsideCodeFence(value, selStart)) {
    return {
      deleteStart: selStart,
      deleteEnd: selStart,
      insert: "\n",
      selectStart: selStart + 1,
      selectEnd: selStart + 1,
    };
  }

  const ls = lineStart(value, selStart);
  // 取「当前光标所在完整行」（含行尾之前的内容）
  const nlIdx = value.indexOf("\n", selStart);
  const lineEnd = nlIdx === -1 ? value.length : nlIdx;
  const fullLine = value.slice(ls, lineEnd);
  // 用 fullLine 判前缀（因为前缀判定要看整行，不只是光标前的部分）
  const decision = nextPrefix(fullLine);

  if (decision.kind === "exit") {
    // 空项退出：删除当前行前缀（保留行内可能已有的尾随内容 = 空串），
    // 然后插入换行 + 无前缀的新行。
    // 这里「退出」= 把当前空列表项整行删除并换成换行。
    return {
      deleteStart: ls,
      deleteEnd: lineEnd,
      insert: "",
      selectStart: ls,
      selectEnd: ls,
    };
  }

  if (decision.kind === "continue") {
    const insert = "\n" + decision.prefix;
    return {
      deleteStart: selStart,
      deleteEnd: selStart,
      insert,
      selectStart: selStart + insert.length,
      selectEnd: selStart + insert.length,
    };
  }

  // none：普通换行
  return {
    deleteStart: selStart,
    deleteEnd: selStart,
    insert: "\n",
    selectStart: selStart + 1,
    selectEnd: selStart + 1,
  };
}
