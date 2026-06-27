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
  // 脏标记：仅当用户真正改动后才自动保存，避免切换笔记/无关重渲染时用旧值覆盖服务端
  const dirty = useRef(false);
  // 自动保存的防抖定时器句柄
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 笔记切换时同步本地状态，并重置脏标记（刚加载的内容不算"已修改"）
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTagIds(note.tags.map((t) => t.id));
      setProtected(note.is_protected);
      dirty.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // 自动保存：仅当脏标记为真时，在输入停顿 1.5s 后提交
  useEffect(() => {
    if (!note || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateNote.mutate({
        id: note.id,
        payload: { title, content, tag_ids: tagIds, is_protected: protected_ },
      });
      dirty.current = false; // 已提交，重置脏标记
    }, 1500);
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

  // 用户改动时置脏
  function onTitle(e: React.ChangeEvent<HTMLInputElement>) {
    dirty.current = true;
    setTitle(e.target.value);
  }
  function onContent(v: string) {
    dirty.current = true;
    setContent(v);
  }
  function onTags(ids: number[]) {
    dirty.current = true;
    setTagIds(ids);
  }
  function onProtected(e: React.ChangeEvent<HTMLInputElement>) {
    dirty.current = true;
    setProtected(e.target.checked);
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
          onChange={onTitle}
          style={{ fontWeight: 600, fontSize: 16, flex: 1 }}
        />
        <button className="btn-ghost" onClick={exportMd}>
          ⬇ 导出
        </button>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={protected_}
            onChange={onProtected}
          />{" "}
          🔒 保护
        </label>
      </div>
      <div className="topbar">
        <TagPicker selected={tagIds} onChange={onTags} />
      </div>
      <MarkdownSplit value={content} onChange={onContent} />
    </div>
  );
}
