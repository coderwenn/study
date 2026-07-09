// Markdown 分栏：左侧 textarea 源码，右侧 react-markdown 实时预览（prose 排版，含 GFM）
// 顶部常驻格式工具栏 + 快捷键（IME guard / e.code 分发），命令为纯函数，写回走 execCommand 保撤销
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
  onSave?: () => void; // ⌘S 立即保存（可选，NoteEditor 透传）
}

export default function MarkdownSplit({ value, onChange, onSave }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number } | null>(null);

  // 还原光标：在 value 变更提交后（useEffect 时机）把选区设回目标位置，避开受控组件重渲染重置光标
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
          className="flex-1 min-w-0 resize-none border-none outline-none p-8 font-mono text-sm leading-7 text-on-surface bg-surface-raised placeholder:text-on-surface-muted placeholder:italic transition-colors duration-200"
        />
        {/* 预览区：为空时显示占位提示，避免空白 */}
        <div className="w-2/5 shrink-0 min-w-0 overflow-y-auto border-l border-outline-variant/40 bg-surface-container-low/50 p-8">
          {value ? (
            <div className="prose prose-slate max-w-none prose-headings:text-on-surface prose-headings:font-semibold prose-p:text-on-surface-variant prose-a:text-primary prose-strong:text-on-surface prose-code:text-primary prose-code:bg-primary-soft prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-primary prose-blockquote:text-on-surface-variant">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-on-surface-muted italic text-sm">预览区</p>
          )}
        </div>
      </div>
    </div>
  );
}
