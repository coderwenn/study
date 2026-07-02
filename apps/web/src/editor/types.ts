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
