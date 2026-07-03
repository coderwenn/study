import { describe, it, expect, vi, beforeEach } from "vitest";

// 把 axios 实例桩掉：只关心 publishNoteToWiki 调对 URL、透传返回值
vi.mock("../api/client", () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

import api from "../api/client";
import { publishNoteToWiki } from "../api/wiki";

describe("publishNoteToWiki", () => {
  beforeEach(() => {
    (api.post as any).mockReset();
  });

  it("POST /api/notes/:id/wiki 并返回 path/slug/overwritten", async () => {
    (api.post as any).mockResolvedValue({
      data: { path: "/wiki/entries/x.md", slug: "x", overwritten: false },
    });
    const r = await publishNoteToWiki(5);
    expect(api.post).toHaveBeenCalledWith("/api/notes/5/wiki");
    expect(r).toEqual({ path: "/wiki/entries/x.md", slug: "x", overwritten: false });
  });
});
