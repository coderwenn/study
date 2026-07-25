// 笔记的服务端状态：列表、详情、废纸篓、置顶，自动失效相关缓存
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "../api/notes";
import type { NoteCreatePayload } from "../api/notes";
import { TAGS_KEY } from "./useTags";
import type { Note } from "../types";

export const NOTES_KEY = ["notes"] as const;
// 废纸篓独立缓存 key，避免与正常列表互相污染
export const TRASH_KEY = ["notes", "trash"] as const;

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
    mutationFn: (payload: NoteCreatePayload) => notesApi.createNote(payload),
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
    // 软删除：笔记移入废纸篓，正常列表消失、废纸篓出现
    mutationFn: (id: number) => notesApi.deleteNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      // 失效废纸篓缓存（恢复时也走这里）
      qc.invalidateQueries({ queryKey: TRASH_KEY });
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
}

// 废纸篓列表：独立 query，避免与正常列表 params 互相干扰
export function useTrashList() {
  return useQuery({
    queryKey: [...TRASH_KEY, "list"],
    queryFn: () => notesApi.listTrash(),
  });
}

// 恢复笔记：从废纸篓移回正常列表
export function useRestoreNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.restoreNote(id),
    onSuccess: () => {
      // 正常列表需重新加载（笔记回归）
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      // 废纸篓列表需重新加载（笔记移出）
      qc.invalidateQueries({ queryKey: TRASH_KEY });
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
}

// 彻底删除：物理删除废纸篓中的笔记
export function usePurgeNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.purgeNote(id),
    onSuccess: () => {
      // 仅废纸篓列表受影响（正常列表本就不含已删除笔记）
      qc.invalidateQueries({ queryKey: TRASH_KEY });
    },
  });
}

// 置顶笔记：标记并记录时间，列表排序变化
export function usePinNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.pinNote(id),
    onSuccess: () => {
      // 列表排序变化，需重新加载
      qc.invalidateQueries({ queryKey: [...NOTES_KEY, "list"] });
      // 详情缓存（is_pinned 变化）
      qc.invalidateQueries({ queryKey: NOTES_KEY });
    },
  });
}

// 取消置顶：清除标记，列表排序变化
export function useUnpinNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notesApi.unpinNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...NOTES_KEY, "list"] });
      qc.invalidateQueries({ queryKey: NOTES_KEY });
    },
  });
}
