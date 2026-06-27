// 中栏：搜索框 + 笔记列表
import { useNoteList } from "../hooks/useNotes";
import type { NoteListItem } from "../types";

interface Props {
  selectedNoteId: number | null;
  onSelect: (id: number) => void;
  query: string;
  setQuery: (q: string) => void;
  tagId: number | null;
}

export default function NoteList({ selectedNoteId, onSelect, query, setQuery, tagId }: Props) {
  const { data: notes = [], isLoading } = useNoteList({ q: query || undefined, tag: tagId ?? undefined });

  return (
    <div className="notelist">
      <div className="topbar">
        <input placeholder="🔍 搜索笔记…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {isLoading && <div style={{ padding: 12, color: "#9ca3af" }}>加载中…</div>}
      {notes.map((n: NoteListItem) => (
        <div
          key={n.id}
          className={`note-item ${selectedNoteId === n.id ? "active" : ""}`}
          onClick={() => onSelect(n.id)}
        >
          <div className="title">{n.is_protected && "🔒 "}{n.title}</div>
          <div className="meta">{n.snippet}</div>
          <div className="meta">
            {new Date(n.updated_at).toLocaleDateString()} ·{" "}
            {n.tags.map((t) => `#${t.name}`).join(" ")}
          </div>
        </div>
      ))}
      {!isLoading && notes.length === 0 && (
        <div style={{ padding: 12, color: "#9ca3af" }}>暂无笔记</div>
      )}
    </div>
  );
}
