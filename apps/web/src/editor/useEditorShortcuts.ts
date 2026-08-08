import { useCallback } from "react";
import { commands, keymap } from "./markdownCommands";
import { computeEnterEdit } from "./listContinuation";
import { runEdit } from "./runEdit";
import type { Edit, EditorState } from "./types";

export interface ShortcutOptions {
  ref: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  restoreSelection: (start: number, end: number) => void;
}

// 由键盘事件生成 keymap 签名：mod+ / alt+ / shift+ 前缀 + e.code（用 e.code 而非 e.key，避免 Shift+7=e.key"&"）
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

      // IME guard：输入法组合态一律放行，绝不拦截（中文输入）
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

      // Enter：续行前缀（列表/引用/任务）+ 单回车即换行（配合 remark-breaks 渲染 <br>）
      // Shift+Enter 或 Ctrl/Cmd+Enter：不拦截，交浏览器默认（让用户保留「硬新段」的逃生口）
      if (e.code === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const state: EditorState = { value: opts.value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd };
        runEdit(ta, computeEnterEdit(state), { onChange: opts.onChange, restoreSelection: opts.restoreSelection });
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
