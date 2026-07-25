import api from "./client";
import type { Note, NoteListItem, TrashListItem } from "../types";

export async function listNotes(params?: { q?: string; tag?: number }): Promise<NoteListItem[]> {
  const { data } = await api.get<NoteListItem[]>("/api/notes/", { params });
  return data;
}

export async function getNote(id: number): Promise<Note> {
  const { data } = await api.get<Note>(`/api/notes/${id}`);
  return data;
}

// 创建负载：与后端 NoteCreate schema 对齐（title 必填，tag_ids 用于关联标签）
export type NoteCreatePayload = Partial<Omit<Note, "tags">> & { title: string; tag_ids?: number[] };

export async function createNote(payload: NoteCreatePayload): Promise<Note> {
  const { data } = await api.post<Note>("/api/notes/", payload);
  return data;
}

// 更新负载允许携带 tag_ids（与后端 NoteUpdate schema 一致）
export type NoteUpdatePayload = Partial<Omit<Note, "tags">> & { tag_ids?: number[] };

export async function updateNote(id: number, payload: NoteUpdatePayload): Promise<Note> {
  // axios 直接透传 payload，运行期 tag_ids 会被后端正确解析
  const { data } = await api.put<Note>(`/api/notes/${id}`, payload);
  return data;
}

// 软删除笔记：移入废纸篓，受保护笔记后端返回 403
export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/api/notes/${id}`);
}

// 列出废纸篓中的笔记（按删除时间倒序）
export async function listTrash(): Promise<TrashListItem[]> {
  const { data } = await api.get<TrashListItem[]>("/api/notes/trash/");
  return data;
}

// 从废纸篓恢复笔记
export async function restoreNote(id: number): Promise<Note> {
  const { data } = await api.post<Note>(`/api/notes/${id}/restore`);
  return data;
}

// 彻底删除笔记（物理删除，仅限废纸篓中的笔记）
export async function purgeNote(id: number): Promise<void> {
  await api.delete(`/api/notes/${id}/purge`);
}

// 置顶笔记
export async function pinNote(id: number): Promise<Note> {
  const { data } = await api.post<Note>(`/api/notes/${id}/pin`);
  return data;
}

// 取消置顶
export async function unpinNote(id: number): Promise<Note> {
  const { data } = await api.post<Note>(`/api/notes/${id}/unpin`);
  return data;
}
