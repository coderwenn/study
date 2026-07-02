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
  const urlStart = s.selectionStart + 1 + text.length + 2; // [ 文本 ]( 之后再跳过 "("
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

// 标题：先去掉任意已有标题级别(#~######)，再设为目标级别；已是目标级别则去除(toggle)
function setHeading(level: number): Command {
  const prefix = "#".repeat(level) + " ";
  const headingRe = /^#{1,6} /;
  return (s: EditorState): Edit => {
    const { start, end } = lineRange(s);
    const lines = s.value.slice(start, end).split("\n");
    const nextBlock = lines
      .map((l) => {
        const body = l.replace(headingRe, "");
        return l.startsWith(prefix) ? body : prefix + body;
      })
      .join("\n");
    return {
      deleteStart: start,
      deleteEnd: end,
      insert: nextBlock,
      selectStart: start,
      selectEnd: start + nextBlock.length,
    };
  };
}

export const h1: Command = setHeading(1);
export const h2: Command = setHeading(2);
export const h3: Command = setHeading(3);
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
