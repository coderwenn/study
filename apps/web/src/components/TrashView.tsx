// 废纸篓视图：展示已删除笔记列表，支持恢复和彻底删除
// 已删除笔记不可编辑，仅提供恢复（回正常列表）与彻底删除（物理移除）两个操作
import { useState } from "react";
import { Trash2, RotateCcw, NotebookPen } from "lucide-react";
import { useTrashList, useRestoreNote, usePurgeNote } from "../hooks/useNotes";
import type { TrashListItem } from "../types";
import ConfirmDialog from "./ConfirmDialog";

// 日期格式化为 YYYY/M/D
function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TrashView() {
  const { data: notes = [], isLoading } = useTrashList();
  const restoreNote = useRestoreNote();
  const purgeNote = usePurgeNote();

  // 彻底删除二次确认：记录待删除的笔记 id
  const [purgeTarget, setPurgeTarget] = useState<TrashListItem | null>(null);

  async function handleRestore(id: number) {
    await restoreNote.mutateAsync(id);
  }

  async function confirmPurge() {
    if (purgeTarget === null) return;
    await purgeNote.mutateAsync(purgeTarget.id);
    setPurgeTarget(null);
  }

  return (
    <section className="flex-1 min-w-0 h-full bg-surface-raised flex flex-col">
      {/* 顶栏：标题 + 计数 */}
      <header className="px-6 border-b border-outline-variant flex items-center justify-between h-12 shrink-0">
        <div className="flex items-center gap-2">
          <Trash2 className="w-[18px] h-[18px] text-on-surface-variant" />
          <h2 className="text-sm font-semibold text-on-surface m-0">废纸篓</h2>
          {notes.length > 0 && (
            <span className="text-xs text-on-surface-muted">共 {notes.length} 条</span>
          )}
        </div>
        <span className="text-xs text-on-surface-muted">已删除笔记可在废纸篓中恢复</span>
      </header>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4 text-sm text-outline text-center">加载中…</div>}

        {!isLoading && notes.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-outline p-8 text-center">
            <NotebookPen className="w-14 h-14 text-outline-variant" />
            <p className="text-base font-semibold text-on-surface-variant m-0">废纸篓为空</p>
            <p className="text-[13px] m-0">删除的笔记会暂存在这里，可随时恢复</p>
          </div>
        )}

        <div className="divide-y divide-outline-variant/50">
          {notes.map((n: TrashListItem) => (
            <div
              key={n.id}
              className="p-4 hover:bg-surface-container-low transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm mb-1 truncate flex items-center gap-1 text-on-surface">
                    <span className="truncate">{n.title}</span>
                    {n.is_protected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary shrink-0">
                        受保护
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">{n.snippet}</p>
                  <div className="text-[11px] text-outline truncate">
                    删除于 {formatDate(n.deleted_at)}
                    {n.tags.length > 0 && ` · ${n.tags.map((t) => `#${t.name}`).join(" ")}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRestore(n.id)}
                    disabled={restoreNote.isPending}
                    title="恢复到笔记列表"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-primary border border-outline-variant hover:bg-primary-soft transition-colors disabled:opacity-60"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>恢复</span>
                  </button>
                  <button
                    onClick={() => setPurgeTarget(n)}
                    disabled={purgeNote.isPending}
                    title="彻底删除（不可恢复）"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-error border border-outline-variant hover:bg-error/5 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>彻底删除</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 彻底删除二次确认：物理删除不可恢复，需明确告知用户 */}
      <ConfirmDialog
        open={purgeTarget !== null}
        title="彻底删除该笔记？"
        message={
          purgeTarget
            ? `「${purgeTarget.title}」将被永久删除，此操作不可恢复。`
            : ""
        }
        confirmText="彻底删除"
        cancelText="取消"
        danger
        onConfirm={confirmPurge}
        onCancel={() => setPurgeTarget(null)}
      />
    </section>
  );
}
