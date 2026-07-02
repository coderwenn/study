import { commandOrder, keymap } from "../editor/markdownCommands";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Code2, Minus, Link, Table,
} from "lucide-react";

// 命令 id → 图标 + 中文标题（含快捷键提示）
const meta: Record<string, { icon: React.ReactNode; label: string }> = {
  bold: { icon: <Bold className="w-[18px] h-[18px]" />, label: "加粗" },
  italic: { icon: <Italic className="w-[18px] h-[18px]" />, label: "斜体" },
  strikethrough: { icon: <Strikethrough className="w-[18px] h-[18px]" />, label: "删除线" },
  inlineCode: { icon: <Code className="w-[18px] h-[18px]" />, label: "行内代码" },
  h1: { icon: <Heading1 className="w-[18px] h-[18px]" />, label: "H1 标题" },
  h2: { icon: <Heading2 className="w-[18px] h-[18px]" />, label: "H2 标题" },
  h3: { icon: <Heading3 className="w-[18px] h-[18px]" />, label: "H3 标题" },
  unorderedList: { icon: <List className="w-[18px] h-[18px]" />, label: "无序列表" },
  orderedList: { icon: <ListOrdered className="w-[18px] h-[18px]" />, label: "有序列表" },
  taskList: { icon: <ListChecks className="w-[18px] h-[18px]" />, label: "任务列表" },
  quote: { icon: <Quote className="w-[18px] h-[18px]" />, label: "引用" },
  codeBlock: { icon: <Code2 className="w-[18px] h-[18px]" />, label: "代码块" },
  horizontalRule: { icon: <Minus className="w-[18px] h-[18px]" />, label: "分割线" },
  link: { icon: <Link className="w-[18px] h-[18px]" />, label: "链接" },
  insertTable: { icon: <Table className="w-[18px] h-[18px]" />, label: "表格" },
};

// 反查 keymap：命令 id → 可读快捷键（无快捷键的命令留空）
const shortcutFor: Record<string, string> = Object.entries(keymap).reduce(
  (acc, [sig, id]) => {
    const pretty = sig
      .replace("mod+", "⌘/")
      .replace("alt+", "⌥/")
      .replace("shift+", "⇧/")
      .replace("Key", "")
      .replace("Digit", "");
    acc[id] = pretty;
    return acc;
  },
  {} as Record<string, string>
);

interface Props {
  onCommand: (id: string) => void;
}

export function EditorToolbar({ onCommand }: Props) {
  return (
    <div className="flex items-center gap-0.5 px-4 h-10 border-b border-outline-variant bg-white overflow-x-auto sticky top-12 z-10">
      {commandOrder.map((id, i) =>
        id === null ? (
          <div key={`sep-${i}`} className="h-6 w-px bg-outline-variant mx-1 shrink-0" />
        ) : (
          <button
            key={id}
            type="button"
            title={`${meta[id].label}${shortcutFor[id] ? "  " + shortcutFor[id] : ""}`}
            onClick={() => onCommand(id)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-on-surface hover:bg-surface-container-low transition-colors shrink-0"
          >
            {meta[id].icon}
          </button>
        )
      )}
    </div>
  );
}

export default EditorToolbar;
