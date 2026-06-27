export default function NoteEditor({ noteId }: { noteId: number | null }) {
  return (
    <div className="editor">
      <div className="topbar">{noteId == null ? "选择或新建一条笔记" : `编辑 #${noteId}`}</div>
    </div>
  );
}
