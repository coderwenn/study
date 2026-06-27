// 主界面：三栏布局，状态提升到此层
import { useState } from "react";
import "../styles.css";
import Sidebar from "../components/Sidebar";
import NoteList from "../components/NoteList";
import NoteEditor from "../components/NoteEditor";
import { useCreateNote } from "../hooks/useNotes";

export default function NotesPage() {
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const createNote = useCreateNote();

  async function handleCreate() {
    const note = await createNote.mutateAsync({ title: "无标题笔记", content: "" });
    setSelectedId(note.id);
  }

  return (
    <div className="layout">
      <Sidebar selectedTagId={tagId} onSelectTag={setTagId} onCreate={handleCreate} />
      <NoteList
        selectedNoteId={selectedId}
        onSelect={setSelectedId}
        query={query}
        setQuery={setQuery}
        tagId={tagId}
      />
      <NoteEditor noteId={selectedId} />
    </div>
  );
}
