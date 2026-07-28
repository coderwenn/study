import api from "./client";

// PDF 导入返回的草稿（与后端 PdfImportDraft 一致；不落库，预览后复用 createNote）
export interface PdfImportDraft {
  title: string;
  content: string;
  suggested_tags: string[];
}

export type PdfJobStatus = "pending" | "running" | "done" | "failed";

export interface PdfJobResult {
  job_id: string;
  status: PdfJobStatus;
  progress: number; // 已处理页数
  total: number; // 总页数
  draft: PdfImportDraft | null;
  error: string | null;
}

// 上传 PDF，后台异步转 MD，立即返回 job_id
export async function uploadPdf(file: File): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ job_id: string }>("/api/pdf/import", form);
  return data;
}

// 轮询任务状态
export async function getPdfJob(jobId: string): Promise<PdfJobResult> {
  const { data } = await api.get<PdfJobResult>(`/api/pdf/jobs/${jobId}`);
  return data;
}
