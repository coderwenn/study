// 从链接总结：弹窗。粘贴链接→后端 agent 总结→可编辑预览→保存为笔记。
// content = 源链接 + 总结；建议标签可一键应用（缺失则按名创建）。承编辑器先例手动验证。
// Lumina 设计：遮罩模糊、缩放进场、聚焦发光输入、主色渐变按钮、精致 loading。
import { useState } from "react";
import { Link2, Loader2, Sparkles, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { summarizeLink, type SummarizeDraft } from "../api/summarize";
import { createTag } from "../api/tags";
import { useCreateNote } from "../hooks/useNotes";
import { useTags, TAGS_KEY } from "../hooks/useTags";
import TagPicker from "./TagPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (noteId: number) => void;
}

type Phase = "input" | "loading" | "preview";

export default function SummarizeDialog({ open, onClose, onSaved }: Props) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [draft, setDraft] = useState<SummarizeDraft | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const createNote = useCreateNote();
  const { data: tags = [] } = useTags();
  const qc = useQueryClient();

  if (!open) return null;

  function reset() {
    setUrl("");
    setPhase("input");
    setDraft(null);
    setTitle("");
    setSummary("");
    setTagIds([]);
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  // 调后端总结
  async function run() {
    if (!url.trim()) return;
    setPhase("loading");
    setError("");
    try {
      const d = await summarizeLink(url.trim());
      setDraft(d);
      setTitle(d.title);
      setSummary(d.summary);
      setTagIds([]);
      setPhase("preview");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "总结失败，请稍后再试");
      setPhase("input");
    }
  }

  // 按名确保标签存在（缺失则创建），返回 id
  async function ensureTag(name: string): Promise<number> {
    const hit = tags.find((t) => t.name === name);
    if (hit) return hit.id;
    const t = await createTag(name);
    qc.invalidateQueries({ queryKey: TAGS_KEY });
    return t.id;
  }

  // 一键应用建议标签
  async function applySuggested() {
    if (!draft?.suggested_tags?.length) return;
    try {
      const ids = await Promise.all(draft.suggested_tags.map(ensureTag));
      setTagIds(Array.from(new Set([...tagIds, ...ids])));
    } catch {
      setError("部分标签应用失败");
    }
  }

  // 保存为笔记：content = 源链接 + 总结
  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const content = `> 来源：[${draft.url}](${draft.url})\n\n${summary}`;
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

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-surface-raised rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-soft-lg animate-scale-in border border-outline-variant/40">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-soft-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span>从链接总结</span>
          </div>
          <button
            onClick={close}
            title="关闭"
            className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {/* URL 输入 */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-outline-variant rounded-lg focus-within:border-primary focus-within:shadow-glow transition-all duration-200 ease-out-expo">
              <Link2 className="w-4 h-4 text-on-surface-muted shrink-0" />
              <input
                autoFocus
                placeholder="粘贴链接，如 https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && phase === "input" && run()}
                disabled={phase !== "input"}
                className="flex-1 text-sm bg-transparent focus:outline-none disabled:text-on-surface-muted placeholder:text-on-surface-muted"
              />
            </div>
            {phase === "input" && (
              <button
                onClick={run}
                disabled={!url.trim()}
                className="px-4 py-2 bg-gradient-to-br from-primary to-primary-dark hover:shadow-glow-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:hover:shadow-none transition-all duration-200 ease-out-expo"
              >
                总结
              </button>
            )}
          </div>

          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 text-on-surface-variant text-sm py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>正在抓取并总结…（最长约 1 分钟）</span>
            </div>
          )}

          {phase === "preview" && draft && (
            <>
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full text-sm px-3 py-2 border border-outline-variant rounded-lg bg-surface-raised text-on-surface focus:outline-none focus:border-primary focus:shadow-glow transition-all duration-200"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  总结（可编辑，保存后进入笔记正文）
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="mt-1.5 w-full flex-1 min-h-[180px] text-sm px-3 py-2 border border-outline-variant rounded-lg bg-surface-raised text-on-surface focus:outline-none focus:border-primary focus:shadow-glow resize-none font-mono leading-6 transition-all duration-200"
                />
              </div>
              {/* 建议标签：一键应用 + 现有 TagPicker */}
              {draft.suggested_tags?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-on-surface-variant">建议标签：</span>
                  {draft.suggested_tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 text-xs bg-primary-soft text-primary rounded-md font-medium"
                    >
                      # {t}
                    </span>
                  ))}
                  <button
                    onClick={applySuggested}
                    className="text-xs text-primary font-medium hover:text-primary-dark hover:underline transition-colors duration-200"
                  >
                    一键应用
                  </button>
                </div>
              )}
              <div>
                <TagPicker selected={tagIds} onChange={setTagIds} />
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-error bg-error/8 border border-error/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* 底栏 */}
        {phase === "preview" && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-outline-variant">
            <button
              onClick={close}
              className="px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-hover rounded-lg transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-br from-primary to-primary-dark hover:shadow-glow-primary text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-all duration-200 ease-out-expo"
            >
              {saving ? "保存中…" : "保存为笔记"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
