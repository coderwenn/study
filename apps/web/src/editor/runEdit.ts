import type { Edit, EditorState } from "./types";
import { applyEdit } from "./types";

export interface RunEditCallbacks {
  onChange: (value: string) => void; // 更新受控 value
  restoreSelection: (start: number, end: number) => void; // 在 useLayoutEffect 里还原光标
}

// 能力探测：浏览器支持 execCommand('insertText') 才走原生通道（保撤销）；jsdom 等不支持时回退
function canExecCommand(): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand("insertText", false, "");
  } catch {
    return false; // jsdom 会抛 "Not implemented"
  }
}

// 把 Edit 写回 textarea：优先 execCommand（保撤销），否则回退到 onChange（功能保底）
export function runEdit(ta: HTMLTextAreaElement, edit: Edit, cb: RunEditCallbacks): void {
  if (canExecCommand()) {
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
