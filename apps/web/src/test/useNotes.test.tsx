// 笔记增删改成功后必须同时失效 TAGS_KEY：note_count 依赖「笔记↔标签」关联，
// 否则侧边栏的空标签过滤会读到过期计数（加/移标签后不即时生效）。
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateNote, useDeleteNote, useUpdateNote, NOTES_KEY } from "../hooks/useNotes";
import { TAGS_KEY } from "../hooks/useTags";
import * as notesApi from "../api/notes";

vi.mock("../api/notes");

function withQc(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// 挂载即用给定 hook 触发一次 mutation（包裹在传入的 QueryClient 中）
function fire(useHook: () => { mutate: (arg: any) => void }, arg: any, qc: QueryClient) {
  function Probe() {
    const { mutate } = useHook();
    useEffect(() => {
      mutate(arg);
    }, []);
    return null;
  }
  return render(<Probe />, { wrapper: withQc(qc) });
}

describe("笔记增删改成功后失效 TAGS_KEY（保证 note_count 即时刷新）", () => {
  it("useUpdateNote 失效 NOTES_KEY 与 TAGS_KEY", async () => {
    (notesApi.updateNote as unknown as vi.Mock).mockResolvedValue({});
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    fire(useUpdateNote, { id: 1, payload: { tag_ids: [1] } }, qc);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: NOTES_KEY }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: TAGS_KEY }));
  });

  it("useDeleteNote 失效 NOTES_KEY 与 TAGS_KEY", async () => {
    (notesApi.deleteNote as unknown as vi.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    fire(useDeleteNote, 1, qc);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: NOTES_KEY }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: TAGS_KEY }));
  });

  it("useCreateNote 失效 NOTES_KEY 与 TAGS_KEY", async () => {
    (notesApi.createNote as unknown as vi.Mock).mockResolvedValue({});
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    fire(useCreateNote, { title: "x" }, qc);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: NOTES_KEY }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: TAGS_KEY }));
  });
});
