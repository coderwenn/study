// Markdown 分栏：左侧 textarea 源码，右侧 react-markdown 实时预览
import ReactMarkdown from "react-markdown";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MarkdownSplit({ value, onChange }: Props) {
  return (
    <div className="split">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="用 Markdown 书写…"
      />
      <div className="preview">
        {/* value 为空时显示占位提示，避免预览区空白 */}
        <ReactMarkdown>{value || "*预览区*"}</ReactMarkdown>
      </div>
    </div>
  );
}
