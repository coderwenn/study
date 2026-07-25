// 导入 Markdown：弹窗。多选 .md 文件 → 前端解析（frontmatter title / H1 / 文件名）
// → 列表预览（每条可改标题、可删除）→ 公共标签 → 批量创建笔记。
// 与「导出 .md」（NoteEditor.exportMd 纯前端 Blob 下载）对称，纯前端实现，复用现有 createNote。
// 标签对所有导入笔记共用一组，避免每条都开 picker。
import { useRef, useState } from "react";
import { Upload, Loader2, X, FileText, Trash2, CheckCircle2 } from "lucide-react";
import { useCreateNote } from "../hooks/useNotes";
import { parseMarkdownFile } from "../utils/markdownImport";
import TagPicker from "./TagPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (noteId: number) => void;
}

// 预览项：解析结果 + 临时 id（仅前端使用）
interface ImportItem {
  id: string;
  filename: string;
  title: string;
  content: string;
}

// 正文摘要：去空白后截断
function snippet(text: string, n = 80): string {
  const flat = text.split(/\s+/).join(" ");
  return flat.slice(0, n);
}

export default function ImportDialog({ open, onClose, onSaved }: Props) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createNote = useCreateNote();

  if (!open) return null;

  function reset() {
    setItems([]);
    setTagIds([]);
    setParsing(false);
    setImporting(false);
    setProgress(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (importing) return; // 导入中不允许关闭
    reset();
    onClose();
  }

  // 选择文件后解析
  async function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setParsing(true);
    setError("");
    try {
      const parsed = await Promise.all(files.map(parseMarkdownFile));
      // 合并到现有列表（支持多次追加选择）
      const newItems: ImportItem[] = parsed.map((p, i) => ({
        id: `${Date.now()}-${i}`,
        filename: p.filename,
        title: p.title,
        content: p.content,
      }));
      setItems((prev) => [...prev, ...newItems]);
    } catch {
      setError("文件解析失败，请确认是 UTF-8 编码的 Markdown 文件");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // 允许再次选择同名文件
    }
  }

  // 修改某条标题
  function updateTitle(id: string, title: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
  }

  // 删除某条
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // 批量导入
  async function importAll() {
    if (items.length === 0) return;
    setImporting(true);
    setError("");
    setProgress({ done: 0, total: items.length, failed: 0 });
    let lastId: number | null = null;
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const note = await createNote.mutateAsync({
          title: it.title.trim() || "无标题",
          content: it.content,
          tag_ids: tagIds,
        });
        lastId = note.id;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: items.length, failed });
    }
    setImporting(false);
    if (lastId !== null) {
      onSaved(lastId);
      close();
    } else {
      setError("全部导入失败，请重试");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <Upload className="w-4 h-4 text-primary" />
            <span>导入 Markdown</span>
          </div>
          <button
            onClick={close}
            title="关闭"
            disabled={importing}
            className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {/* 文件选择 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing || importing}
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant hover:border-primary text-on-surface text-sm font-medium rounded-md transition-colors disabled:opacity-60"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{parsing ? "解析中…" : "选择 .md 文件"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.markdown,.mdown,.mkd,text/markdown,text/plain"
              onChange={onFilesChange}
              className="hidden"
            />
            <span className="text-xs text-on-surface-variant">
              可多选，支持 .md / .markdown，标题自动从 frontmatter 或首个 H1 提取
            </span>
          </div>

          {/* 预览列表 */}
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="border border-outline-variant rounded-md p-3 flex flex-col gap-2 bg-surface-container-low/40"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-on-surface-variant shrink-0" />
                    <span className="text-xs text-on-surface-muted truncate flex-1">{it.filename}</span>
                    {!importing && (
                      <button
                        onClick={() => removeItem(it.id)}
                        title="移除"
                        className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container-low hover:text-error transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    value={it.title}
                    onChange={(e) => updateTitle(it.id, e.target.value)}
                    disabled={importing}
                    placeholder="笔记标题..."
                    className="w-full text-sm px-2 py-1.5 border border-outline-variant rounded-md bg-surface-raised text-on-surface focus:outline-none focus:border-primary disabled:opacity-60"
                  />
                  {it.content && (
                    <p className="text-xs text-on-surface-variant m-0 leading-relaxed line-clamp-2">
                      {snippet(it.content)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 空状态 */}
          {items.length === 0 && !parsing && (
            <div className="flex flex-col items-center justify-center py-10 text-on-surface-muted text-center gap-2">
              <FileText className="w-10 h-10 text-outline-variant" />
              <p className="text-sm m-0">尚未选择文件</p>
              <p className="text-xs m-0">点击上方「选择 .md 文件」开始</p>
            </div>
          )}

          {/* 公共标签（仅在有待导入项时展示） */}
          {items.length > 0 && (
            <div className="pt-2 border-t border-outline-variant">
              <div className="text-xs text-on-surface-variant mb-1">标签（应用到全部导入笔记）</div>
              <TagPicker selected={tagIds} onChange={setTagIds} />
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          {/* 导入进度 */}
          {importing && progress && (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                导入中 {progress.done}/{progress.total}
                {progress.failed > 0 && `（失败 ${progress.failed}）`}
              </span>
            </div>
          )}
        </div>

        {/* 底栏 */}
        {items.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-outline-variant">
            <span className="text-xs text-on-surface-variant">
              共 {items.length} 条
              {tagIds.length > 0 && ` · ${tagIds.length} 个标签`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={close}
                disabled={importing}
                className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-md disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={importAll}
                disabled={importing || items.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-md disabled:opacity-60"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{importing ? "导入中…" : `导入 ${items.length} 条`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
