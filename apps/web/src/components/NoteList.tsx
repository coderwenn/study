// 中栏：搜索框 + 笔记列表
// Lumina 设计：聚焦发光搜索框、卡片化列表项（悬停浮起）、激活态主色条 + 柔光背景、优雅空状态。
// 列表项：标题（受保护显示锁标）/ 摘要两行截断 / 日期·标签 / 悬停删除按钮
import { Search, Trash2, Lock, FileSearch } from "lucide-react";
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
      <div className="p-3 border-b border-outline-variant">
        <div className="relative group">
          <span className="absolute inset-y-0 left-3 flex items-center text-on-surface-muted pointer-events-none group-focus-within:text-primary transition-colors duration-200">
            <Search className="w-[16px] h-[16px]" />
          </span>
          <input
            type="text"
            placeholder="搜索笔记..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-transparent rounded-lg text-sm text-on-surface focus:bg-surface-raised focus:border-primary focus:shadow-glow placeholder:text-on-surface-muted focus:outline-none transition-all duration-200 ease-out-expo"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="p-8 text-sm text-on-surface-muted text-center flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
            <span>加载中…</span>
          </div>
        )}

        {notes.map((n: NoteListItem) => {
          const active = selectedNoteId === n.id;
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`group relative p-3 mb-1 rounded-lg cursor-pointer transition-all duration-200 ease-out-expo ${
                active
                  ? "bg-primary-soft shadow-soft-sm"
                  : "hover:bg-surface-hover"
              }`}
            >
              {/* 激活态：左侧主色指示条 */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-gradient-to-b from-primary to-primary-dark" />
              )}
              <h3
                className={`font-semibold text-sm mb-1 truncate flex items-center gap-1.5 ${
                  active ? "text-primary" : "text-on-surface"
                }`}
              >
                {n.is_protected && <Lock className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className="truncate">{n.title}</span>
              </h3>
              <p className="text-xs text-on-surface-variant line-clamp-2 mb-2 leading-relaxed">
                {n.snippet}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-on-surface-muted truncate flex-1">
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
                  className={`shrink-0 p-1 rounded-md transition-all duration-200 ${
                    n.is_protected
                      ? "text-on-surface-muted/40 cursor-not-allowed"
                      : "text-on-surface-muted opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:!text-error"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* 空状态：精致插画感 */}
        {!isLoading && notes.length === 0 && (
          <div className="p-8 text-center flex flex-col items-center gap-3 text-on-surface-muted">
            <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center">
              <FileSearch className="w-6 h-6 text-on-surface-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface-variant m-0 mb-0.5">
                {query ? "未找到匹配笔记" : "暂无笔记"}
              </p>
              <p className="text-xs m-0">
                {query ? "试试其他关键词" : "点击左侧「新建笔记」开始"}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
