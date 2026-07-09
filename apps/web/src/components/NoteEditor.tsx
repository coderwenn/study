// 编辑器：标题、保护开关、导出、标签区、Markdown 分栏；输入防抖自动保存
// Lumina 设计：玻璃质感顶栏、统一描边操作按钮、精致保护开关、空状态优化。
// 逻辑保持不变：本地状态与服务端解耦，脏标记 + 1.5s 防抖提交
import { useEffect, useRef, useState } from "react";
import { Download, Lock, NotebookPen, Send, CheckCircle2, XCircle } from "lucide-react";
import { publishNoteToWiki } from "../api/wiki";
import { useNote, useUpdateNote } from "../hooks/useNotes";
import MarkdownSplit from "./MarkdownSplit";
import TagPicker from "./TagPicker";

// 操作按钮公共样式：描边 + 悬停柔光背景
const actionBtn =
  "flex items-center gap-1.5 px-2.5 py-1.5 border border-outline-variant rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-hover hover:text-on-surface hover:border-outline transition-all duration-200 ease-out-expo disabled:opacity-60 disabled:hover:bg-transparent";

export default function NoteEditor({ noteId }: { noteId: number | null }) {
  const { data: note } = useNote(noteId);
  const updateNote = useUpdateNote();

  // 本地编辑状态：与服务端数据解耦，便于防抖提交
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [protected_, setProtected] = useState(false);
  // 发布到 Wiki 的瞬时状态：null=无提示；4s 自动清空（与 exportMd 同为本地函数，无缓存副作用）
  const [wikiMsg, setWikiMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
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

  // 未选中笔记：空状态
  if (!note) {
    return (
      <main className="flex-1 min-w-0 h-full bg-surface-raised flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-soft to-surface-container-low flex items-center justify-center shadow-soft">
          <NotebookPen className="w-10 h-10 text-primary/60" />
        </div>
        <div>
          <p className="text-base font-semibold text-on-surface-variant m-0 mb-1">选择一条笔记开始编辑</p>
          <p className="text-[13px] text-on-surface-muted m-0">或点击左侧「新建笔记」创建</p>
        </div>
      </main>
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

  // 立即保存：跳过 1.5s 防抖，强制 flush 当前内容（⌘S / Ctrl+S 触发）
  const saveNow = () => {
    if (!note) return;
    // 取消尚未触发的防抖定时器，避免保存后再次重复提交
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return; // 无改动则不重复请求
    updateNote.mutate({
      id: note.id,
      payload: { title, content, tag_ids: tagIds, is_protected: protected_ },
    });
    dirty.current = false; // 已强制提交，重置脏标记
  };

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

  // 发布到 Wiki：把当前笔记写进服务器 entries/（仅 owner；失败显示后端 detail）
  async function publishToWiki() {
    if (!note) return;
    setPublishing(true);
    setWikiMsg(null);
    try {
      const r = await publishNoteToWiki(note.id);
      setWikiMsg({
        kind: "ok",
        text: r.overwritten ? `已更新：${r.slug}.md` : `已发布：${r.slug}.md`,
      });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setWikiMsg({ kind: "err", text: typeof detail === "string" ? detail : "发布失败" });
    } finally {
      setPublishing(false);
      // 4s 后自动清空提示，避免长期占用顶栏
      setTimeout(() => setWikiMsg(null), 4000);
    }
  }

  return (
    <main className="flex-1 min-w-0 h-full bg-surface-raised flex flex-col">
      {/* 顶栏：玻璃质感 + 粘性定位 */}
      <header className="px-5 border-b border-outline-variant flex items-center justify-between gap-4 sticky top-0 bg-surface-raised z-20 h-14">
        <input
          type="text"
          placeholder="输入标题..."
          value={title}
          onChange={onTitle}
          className="font-semibold border-none focus:ring-0 focus:outline-none p-0 w-full text-base text-on-surface placeholder:text-on-surface-muted bg-transparent"
        />
        <div className="flex items-center gap-2 shrink-0">
          {/* 发布到 Wiki + 结果提示 */}
          <button
            onClick={publishToWiki}
            disabled={publishing}
            title="发布到 Wiki（写进服务器 entries/）"
            className={actionBtn}
          >
            <Send className="w-[15px] h-[15px]" />
            <span>{publishing ? "发布中…" : "发布到 Wiki"}</span>
          </button>
          {wikiMsg && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md animate-slide-down ${
                wikiMsg.kind === "ok"
                  ? "text-success bg-success/10"
                  : "text-error bg-error/10"
              }`}
            >
              {wikiMsg.kind === "ok" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {wikiMsg.text}
            </span>
          )}
          <button onClick={exportMd} title="导出为 Markdown" className={actionBtn}>
            <Download className="w-[15px] h-[15px]" />
            <span>导出</span>
          </button>
          <div className="h-5 w-px bg-outline-variant mx-0.5" />
          {/* 保护开关：复用 .switch 组件 + 原 checkbox 受控逻辑 */}
          <label className="flex items-center cursor-pointer gap-2 select-none px-1">
            <span className="switch">
              <input type="checkbox" checked={protected_} onChange={onProtected} />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
            </span>
            <span
              className={`text-xs font-medium flex items-center gap-1 transition-colors duration-200 ${
                protected_ ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              保护
            </span>
          </label>
        </div>
      </header>

      {/* 主体：标签区 + Markdown 分栏 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <TagPicker selected={tagIds} onChange={onTags} />
        <MarkdownSplit value={content} onChange={onContent} onSave={saveNow} />
      </div>
    </main>
  );
}
