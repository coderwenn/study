// Markdown 分栏：左侧 textarea 源码，右侧 react-markdown 实时预览（prose 排版）
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MarkdownSplit({ value, onChange }: Props) {
  return (
    <div className="flex-1 min-h-0 flex">
      {/* 源码区 */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="用 Markdown 书写…"
        className="flex-1 min-w-0 resize-none border-none outline-none p-8 font-mono text-sm leading-7 text-on-surface bg-white placeholder:text-outline-variant placeholder:italic"
      />
      {/* 预览区：为空时显示占位提示，避免空白 */}
      <div className="w-2/5 shrink-0 min-w-0 overflow-y-auto border-l border-outline-variant/30 bg-surface-container-low/30 p-8">
        {value ? (
          <div className="prose prose-slate max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-outline-variant italic text-sm">预览区</p>
        )}
      </div>
    </div>
  );
}
