// 编辑器：标题、标签、保护开关、导出、Markdown 分栏；输入防抖自动保存
import { useEffect, useRef, useState } from "react";
import { useNote, useUpdateNote } from "../hooks/useNotes";
import MarkdownSplit from "./MarkdownSplit";
import TagPicker from "./TagPicker";

export default function NoteEditor({ noteId }: { noteId: number | null }) {
  const { data: note } = useNote(noteId);
  const updateNote = useUpdateNote();

  // 本地编辑状态：与服务端数据解耦，便于防抖提交
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [protected_, setProtected] = useState(false);
  // 自动保存的防抖定时器句柄
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 笔记切换时同步本地状态（仅在切换笔记时重置，避免覆盖用户输入）
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTagIds(note.tags.map((t) => t.id));
      setProtected(note.is_protected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // 自动保存：标题/内容/标签/保护状态变化后 1.5s 防抖提交
  useEffect(() => {
    if (!note) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateNote.mutate({
        id: note.id,
        payload: { title, content, tag_ids: tagIds, is_protected: protected_ },
      });
    }, 1500);
    // 卸载或下一次变化前清除未触发的定时器
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tagIds, protected_]);

  if (!note) {
    return (
      <div className="editor">
        <div className="topbar">选择或新建一条笔记</div>
      </div>
    );
  }

  // 前端导出：标题作 H1 + 正文，触发浏览器下载 .md 文件
  function exportMd() {
    const md = `# ${title}\n\n${content}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="editor">
      <div className="topbar">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ fontWeight: 600, fontSize: 16, flex: 1 }}
        />
        <button className="btn-ghost" onClick={exportMd}>
          ⬇ 导出
        </button>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={protected_}
            onChange={(e) => setProtected(e.target.checked)}
          />{" "}
          🔒 保护
        </label>
      </div>
      <div className="topbar">
        <TagPicker selected={tagIds} onChange={setTagIds} />
      </div>
      <MarkdownSplit value={content} onChange={setContent} />
    </div>
  );
}
