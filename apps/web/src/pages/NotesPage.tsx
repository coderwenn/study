// 主界面：三栏布局，状态提升到此层
// 支持两种视图：notes（正常笔记编辑）/ trash（废纸篓管理）
import { useState } from "react";
import Sidebar, { type View } from "../components/Sidebar";
import NoteList from "../components/NoteList";
import NoteEditor from "../components/NoteEditor";
import TrashView from "../components/TrashView";
import SummarizeDialog from "../components/SummarizeDialog";
import ImportDialog from "../components/ImportDialog";
import { useCreateNote, useDeleteNote } from "../hooks/useNotes";

export default function NotesPage() {
  const [view, setView] = useState<View>("notes");
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  async function handleCreate() {
    const note = await createNote.mutateAsync({ title: "无标题笔记", content: "" });
    // 新建后切回笔记视图并选中
    setView("notes");
    setSelectedId(note.id);
  }

  // 软删除处理：受保护笔记前端拦截（后端亦以 403 强制保护，双重保险）
  async function handleDelete(id: number, isProtected: boolean) {
    if (isProtected) {
      alert("该笔记已设为保护，无法删除。请先在编辑器中取消🔒保护。");
      return;
    }
    if (!confirm("确认将笔记移至废纸篓？可在废纸篓中恢复。")) return;
    await deleteNote.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  }

  // 切换视图时清空选中状态，避免废纸篓视图残留选中
  function handleViewChange(v: View) {
    setView(v);
    if (v === "trash") setSelectedId(null);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={handleViewChange}
        selectedTagId={tagId}
        onSelectTag={setTagId}
        onCreate={handleCreate}
        onSummarize={() => setSummarizeOpen(true)}
        onImport={() => setImportOpen(true)}
      />
      {view === "notes" ? (
        <>
          <NoteList
            selectedNoteId={selectedId}
            onSelect={setSelectedId}
            query={query}
            setQuery={setQuery}
            tagId={tagId}
            onDelete={handleDelete}
          />
          <NoteEditor noteId={selectedId} />
        </>
      ) : (
        <TrashView />
      )}
      <SummarizeDialog
        open={summarizeOpen}
        onClose={() => setSummarizeOpen(false)}
        onSaved={(id) => setSelectedId(id)}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={(id) => setSelectedId(id)}
      />
    </div>
  );
}
