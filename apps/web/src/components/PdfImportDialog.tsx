// 导入 PDF：弹窗。选 PDF → 后端异步转 MD（轮询进度）→ 可编辑预览 → 保存为笔记。
// 与 SummarizeDialog 的草稿模式对称：转换在后端（pymupdf + OCR），前端只展示与编辑。
// content = 来源标注 + 各页分段的 MD；图片暂留占位符。
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { getPdfJob, uploadPdf, type PdfImportDraft } from "../api/pdf";
import { useCreateNote } from "../hooks/useNotes";
import TagPicker from "./TagPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (noteId: number) => void;
}

type Phase = "input" | "uploading" | "preview";

const POLL_MS = 1500;

export default function PdfImportDialog({ open, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [fileName, setFileName] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<PdfImportDraft | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createNote = useCreateNote();

  // 轮询任务状态：done 进预览，failed 回输入态
  useEffect(() => {
    if (phase !== "uploading" || !jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await getPdfJob(jobId);
        if (cancelled) return;
        setProgress(r.progress);
        setTotal(r.total);
        if (r.status === "done" && r.draft) {
          setDraft(r.draft);
          setTitle(r.draft.title);
          setContent(r.draft.content);
          setPhase("preview");
        } else if (r.status === "failed") {
          setError(r.error || "转换失败");
          setPhase("input");
        }
      } catch {
        if (!cancelled) {
          setError("查询任务状态失败");
          setPhase("input");
        }
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [phase, jobId]);

  if (!open) return null;

  function reset() {
    setPhase("input");
    setFileName("");
    setJobId(null);
    setProgress(0);
    setTotal(0);
    setDraft(null);
    setTitle("");
    setContent("");
    setTagIds([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (uploading) return; // 上传/转换中不允许关闭
    reset();
    onClose();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    setUploading(true);
    setPhase("uploading");
    setProgress(0);
    setTotal(0);
    setJobId(null);
    try {
      const { job_id } = await uploadPdf(file);
      setJobId(job_id);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "上传失败，请确认是有效的 PDF（≤30 页、≤20MB）");
      setPhase("input");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const note = await createNote.mutateAsync({
        title: title || draft.title || "无标题",
        content,
        tag_ids: tagIds,
      });
      onSaved(note.id);
      close();
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <FileText className="w-4 h-4 text-primary" />
            <span>导入 PDF</span>
          </div>
          <button
            onClick={close}
            title="关闭"
            disabled={uploading || saving}
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
              disabled={phase !== "input"}
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant hover:border-primary text-on-surface text-sm font-medium rounded-md transition-colors disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{uploading ? "处理中…" : "选择 PDF 文件"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              className="hidden"
            />
            <span className="text-xs text-on-surface-variant">
              支持文本型与扫描版 PDF，≤30 页、≤20MB
            </span>
          </div>

          {/* 转换进度 */}
          {phase === "uploading" && (
            <div className="flex flex-col gap-2 py-4">
              <div className="flex items-center gap-2 text-on-surface-variant text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  正在转换{fileName ? `《${fileName}》` : ""}…
                  {total > 0 && ` ${progress}/${total} 页（${pct}%）`}
                </span>
              </div>
              {total > 0 && (
                <div className="w-full h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-on-surface-muted m-0">扫描版 PDF 较慢，请勿关闭窗口</p>
            </div>
          )}

          {/* 预览编辑 */}
          {phase === "preview" && draft && (
            <>
              <div>
                <label className="text-xs text-on-surface-variant">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 border border-outline-variant rounded-md focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-xs text-on-surface-variant">正文（可编辑，保存后进入笔记）</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="mt-1 w-full flex-1 min-h-[220px] text-sm px-3 py-2 border border-outline-variant rounded-md focus:outline-none focus:border-primary resize-none font-mono"
                />
              </div>
              <div>
                <TagPicker selected={tagIds} onChange={setTagIds} />
              </div>
            </>
          )}

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {/* 底栏 */}
        {phase === "preview" && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-outline-variant">
            <button
              onClick={close}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-md disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-md disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存为笔记"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
