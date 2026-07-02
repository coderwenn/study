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
