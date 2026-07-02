import type { Edit, EditorState } from "./types";
import { applyEdit } from "./types";

export interface RunEditCallbacks {
  onChange: (value: string) => void; // 更新受控 value
  restoreSelection: (start: number, end: number) => void; // 在 useLayoutEffect 里还原光标
}

// 把 Edit 写回 textarea：先尝试 execCommand 原生通道（保撤销），并用「值是否生效」做无焦点安全校验；
// 原生未生效（jsdom 或无焦点/不支持）则回滚后走 onChange fallback。
// 注意：不用 execCommand(...) 做能力探测——它在 textarea 无焦点时返回 false，
// 而工具栏点击会把焦点带到按钮上，会误判为「不支持」从而静默丢失撤销（ADR-001）。
export function runEdit(ta: HTMLTextAreaElement, edit: Edit, cb: RunEditCallbacks): void {
  const prev: EditorState = {
    value: ta.value,
    selectionStart: ta.selectionStart,
    selectionEnd: ta.selectionEnd,
  };
  const next = applyEdit(prev, edit);

  let usedNative = false;
  if (typeof document !== "undefined" && typeof document.execCommand === "function") {
    try {
      ta.focus();
      ta.setSelectionRange(edit.deleteStart, edit.deleteEnd);
      if (edit.deleteStart < edit.deleteEnd) {
        document.execCommand("delete");
      }
      if (edit.insert.length > 0) {
        document.execCommand("insertText", false, edit.insert);
      }
      // 校验原生通道确实生效（无焦点/不支持时 execCommand 是 no-op，ta.value 不变）
      usedNative = ta.value === next.value;
    } catch {
      usedNative = false; // jsdom 等会抛错
    }
  }

  if (usedNative) {
    // 原生通道已改 DOM；同步受控 state（与原生 input 事件可能重复触发 onChange，但 setContent 幂等；
    // 这样即使原生 input 事件未抵达 React，状态也不会漂移、下一次渲染不会回退 DOM 改动）
    cb.onChange(next.value);
  } else {
    // 回滚原生通道可能造成的部分改动，再走 onChange fallback
    if (ta.value !== prev.value) {
      ta.value = prev.value;
    }
    cb.onChange(next.value);
  }
  cb.restoreSelection(next.selectionStart, next.selectionEnd);
}
