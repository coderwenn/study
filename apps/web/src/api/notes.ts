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

export async function updateNote(id: number, payload: Partial<Note>): Promise<Note> {
  const { data } = await api.put<Note>(`/api/notes/${id}`, payload);
  return data;
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/api/notes/${id}`);
}
