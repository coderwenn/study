// 中栏：搜索框 + 笔记列表
// 列表项：标题（受保护显示锁标）/ 摘要两行截断 / 日期·标签 / 悬停删除按钮
import { Search, Trash2, Lock } from "lucide-react";
import { useNoteList } from "../hooks/useNotes";
import type { NoteListItem } from "../types";

interface Props {
  selectedNoteId: number | null;
  onSelect: (id: number) => void;
  query: string;
  setQuery: (q: string) => void;
  tagId: number | null;
  onDelete: (id: number, protected_: boolean) => void;
}

// 日期格式化为 YYYY/M/D，与设计稿一致
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function NoteList({
  selectedNoteId,
  onSelect,
  query,
  setQuery,
  tagId,
  onDelete,
}: Props) {
  const { data: notes = [], isLoading } = useNoteList({
    q: query || undefined,
    tag: tagId ?? undefined,
  });

  return (
    <section className="w-[240px] shrink-0 h-full border-r border-outline-variant bg-surface-raised flex flex-col">
      {/* 搜索 */}
      <div className="p-4 border-b border-outline-variant">
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-outline pointer-events-none">
            <Search className="w-[18px] h-[18px]" />
          </span>
          <input
            type="text"
            placeholder="搜索笔记..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-md text-sm text-on-surface focus:ring-1 focus:ring-primary placeholder:text-outline-variant focus:outline-none"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4 text-sm text-outline text-center">加载中…</div>}

        {notes.map((n: NoteListItem) => {
          const active = selectedNoteId === n.id;
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`group p-4 cursor-pointer transition-colors ${
                active
                  ? "bg-primary/5 border-l-4 border-primary"
                  : "border-b border-outline-variant/50 hover:bg-surface-container-low"
              }`}
            >
              <h3 className="font-semibold text-sm mb-1 truncate flex items-center gap-1">
                {n.is_protected && <Lock className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className="truncate">{n.title}</span>
              </h3>
              <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">{n.snippet}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-outline truncate">
                  {formatDate(n.updated_at)}
                  {n.tags.length > 0 && ` · ${n.tags.map((t) => `#${t.name}`).join(" ")}`}
                </span>
                <button
                  disabled={n.is_protected}
                  title={n.is_protected ? "受保护，无法删除" : "删除"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(n.id, n.is_protected);
                  }}
                  className={`shrink-0 p-0.5 rounded transition-colors ${
                    n.is_protected
                      ? "text-outline-variant/40 cursor-not-allowed"
                      : "text-outline-variant opacity-0 group-hover:opacity-100 hover:!text-error"
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {!isLoading && notes.length === 0 && (
          <div className="p-4 text-sm text-outline text-center">暂无笔记</div>
        )}
      </div>
    </section>
  );
}
