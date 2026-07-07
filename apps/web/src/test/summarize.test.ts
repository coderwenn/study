import { describe, it, expect, vi, beforeEach } from "vitest";

// 桩掉 axios 实例：只关心 summarizeLink 调对 URL、透传返回值
vi.mock("../api/client", () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

import api from "../api/client";
import { summarizeLink } from "../api/summarize";

describe("summarizeLink", () => {
  beforeEach(() => (api.post as any).mockReset());

  it("POST /api/summarize 带 {url} 并回传草稿", async () => {
    (api.post as any).mockResolvedValue({
      data: { url: "https://x", title: "T", summary: "S", suggested_tags: ["a"] },
    });
    const r = await summarizeLink("https://x");
    expect(api.post).toHaveBeenCalledWith("/api/summarize", { url: "https://x" });
    expect(r).toEqual({ url: "https://x", title: "T", summary: "S", suggested_tags: ["a"] });
  });
});
