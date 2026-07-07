// 主界面：三栏布局，状态提升到此层
import { useState } from "react";
import Sidebar from "../components/Sidebar";
import NoteList from "../components/NoteList";
import NoteEditor from "../components/NoteEditor";
import SummarizeDialog from "../components/SummarizeDialog";
import { useCreateNote, useDeleteNote } from "../hooks/useNotes";

export default function NotesPage() {
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  async function handleCreate() {
    const note = await createNote.mutateAsync({ title: "无标题笔记", content: "" });
    setSelectedId(note.id);
  }

  // 删除处理：受保护笔记前端拦截（后端亦以 403 强制保护，双重保险）
  async function handleDelete(id: number, isProtected: boolean) {
    if (isProtected) {
      alert("该笔记已设为保护，无法删除。请先在编辑器中取消🔒保护。");
      return;
    }
    if (!confirm("确认删除该笔记？")) return;
    await deleteNote.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        selectedTagId={tagId}
        onSelectTag={setTagId}
        onCreate={handleCreate}
        onSummarize={() => setSummarizeOpen(true)}
      />
      <NoteList
        selectedNoteId={selectedId}
        onSelect={setSelectedId}
        query={query}
        setQuery={setQuery}
        tagId={tagId}
        onDelete={handleDelete}
      />
      <NoteEditor noteId={selectedId} />
      <SummarizeDialog
        open={summarizeOpen}
        onClose={() => setSummarizeOpen(false)}
        onSaved={(id) => setSelectedId(id)}
      />
    </div>
  );
}
