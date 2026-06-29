// 冒烟测试：确认 lucide 图标渲染为内联 <svg>（而非图标字体文本），杜绝"图标变文字"回归
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plus, Search, Lock, Trash2 } from "lucide-react";

describe("lucide 图标渲染", () => {
  it("Plus 渲染为 <svg>，不含字面文本 add", () => {
    const { container } = render(<Plus />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.textContent).not.toContain("add");
  });

  it("多个图标均产生 svg 且无字面文本", () => {
    const { container } = render(
      <>
        <Search />
        <Lock />
        <Trash2 />
      </>
    );
    expect(container.querySelectorAll("svg").length).toBe(3);
    // 图标字体失效时会留下 ligature 文本；这里应没有任何字面图标名
    const text = container.textContent ?? "";
    ["search", "lock", "delete"].forEach((w) => expect(text).not.toContain(w));
  });
});
