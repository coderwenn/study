import { commandOrder, keymap } from "../editor/markdownCommands";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Code2, Minus, Link, Image, Table,
} from "lucide-react";

// 命令 id → 图标 + 中文标题（含快捷键提示）
const meta: Record<string, { icon: React.ReactNode; label: string }> = {
  bold: { icon: <Bold className="w-[17px] h-[17px]" />, label: "加粗" },
  italic: { icon: <Italic className="w-[17px] h-[17px]" />, label: "斜体" },
  strikethrough: { icon: <Strikethrough className="w-[17px] h-[17px]" />, label: "删除线" },
  inlineCode: { icon: <Code className="w-[17px] h-[17px]" />, label: "行内代码" },
  h1: { icon: <Heading1 className="w-[17px] h-[17px]" />, label: "H1 标题" },
  h2: { icon: <Heading2 className="w-[17px] h-[17px]" />, label: "H2 标题" },
  h3: { icon: <Heading3 className="w-[17px] h-[17px]" />, label: "H3 标题" },
  unorderedList: { icon: <List className="w-[17px] h-[17px]" />, label: "无序列表" },
  orderedList: { icon: <ListOrdered className="w-[17px] h-[17px]" />, label: "有序列表" },
  taskList: { icon: <ListChecks className="w-[17px] h-[17px]" />, label: "任务列表" },
  quote: { icon: <Quote className="w-[17px] h-[17px]" />, label: "引用" },
  codeBlock: { icon: <Code2 className="w-[17px] h-[17px]" />, label: "代码块" },
  horizontalRule: { icon: <Minus className="w-[17px] h-[17px]" />, label: "分割线" },
  link: { icon: <Link className="w-[17px] h-[17px]" />, label: "链接" },
  image: { icon: <Image className="w-[17px] h-[17px]" />, label: "图片" },
  insertTable: { icon: <Table className="w-[17px] h-[17px]" />, label: "表格" },
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
    // 工具栏：玻璃质感 + 粘性定位（紧贴顶栏下方，top-14 与 header 高度对齐）
    <div className="flex items-center gap-0.5 px-4 h-11 border-b border-outline-variant bg-surface-raised overflow-x-auto sticky top-14 z-10">
      {commandOrder.map((id, i) =>
        id === null ? (
          <div key={`sep-${i}`} className="h-5 w-px bg-outline-variant mx-1.5 shrink-0" />
        ) : (
          <button
            key={id}
            type="button"
            title={`${meta[id].label}${shortcutFor[id] ? "  " + shortcutFor[id] : ""}`}
            onClick={() => onCommand(id)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:bg-primary-soft hover:text-primary transition-all duration-200 ease-out-expo active:scale-90 shrink-0"
          >
            {meta[id].icon}
          </button>
        )
      )}
    </div>
  );
}

export default EditorToolbar;
