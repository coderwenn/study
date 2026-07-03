import api from "./client";

// 发布到 Wiki 的返回：服务端 publish_note 的结果
export interface PublishResult {
  path: string;
  slug: string;
  overwritten: boolean;
}

// 把笔记发布为 Wiki Source（服务端写进 entries/；仅 owner，否则 403/503）
export async function publishNoteToWiki(noteId: number): Promise<PublishResult> {
  const { data } = await api.post<PublishResult>(`/api/notes/${noteId}/wiki`);
  return data;
}
