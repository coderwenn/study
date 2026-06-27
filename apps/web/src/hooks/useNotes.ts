// 笔记的服务端状态：列表、详情、增删改，自动失效相关缓存
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "../api/notes";
import type { Note } from "../types";

export const NOTES_KEY = ["notes"] as const;

export function useNoteList(params?: { q?: string; tag?: number }) {
  return useQuery({
    queryKey: [...NOTES_KEY, "list", params],
    queryFn: () => notesApi.listNotes(params),
  });
}

export function useNote(id: number | null) {
  return useQuery({
    queryKey: [...NOTES_KEY, "detail", id],
    queryFn: () => notesApi.getNote(id!),
    enabled: id != null,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Note> & { title: string }) => notesApi.createNote(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Note> }) =>
      notesApi.updateNote(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}
