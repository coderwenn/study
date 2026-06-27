import api from "./client";
import type { Note, NoteListItem } from "../types";

export async function listNotes(params?: { q?: string; tag?: number }): Promise<NoteListItem[]> {
  const { data } = await api.get<NoteListItem[]>("/api/notes/", { params });
  return data;
}

export async function getNote(id: number): Promise<Note> {
  const { data } = await api.get<Note>(`/api/notes/${id}`);
  return data;
}

export async function createNote(payload: Partial<Note> & { title: string }): Promise<Note> {
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

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/api/notes/${id}`);
}
