import api from "./client";

// 网页总结返回的草稿（与后端 SummarizeDraft 一致；不落库）
export interface SummarizeDraft {
  url: string;
  title: string;
  summary: string;
  suggested_tags: string[];
}

// 把链接交给后端 agent 抓取+总结，返回草稿
export async function summarizeLink(url: string): Promise<SummarizeDraft> {
  const { data } = await api.post<SummarizeDraft>("/api/summarize", { url });
  return data;
}
