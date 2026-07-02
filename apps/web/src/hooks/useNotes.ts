// 笔记的服务端状态：列表、详情、增删改，自动失效相关缓存
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "../api/notes";
import { TAGS_KEY } from "./useTags";
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      // 笔记的标签关联会改变各标签 note_count，需同步失效标签缓存
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
}

// 更新负载：与后端 NoteUpdate schema 对齐，tag_ids 用于重新关联标签
export type NoteUpdatePayload = Partial<Omit<Note, "tags">> & { tag_ids?: number[] };

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    // updateNote 接受 Partial<Note>，运行期会原样透传 tag_ids 给后端 PUT
    mutationFn: ({ id, payload }: { id: number; payload: NoteUpdatePayload }) =>
      notesApi.updateNote(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      // 笔记的标签关联会改变各标签 note_count，需同步失效标签缓存
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.deleteNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      // 笔记的标签关联会改变各标签 note_count，需同步失效标签缓存
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
}
