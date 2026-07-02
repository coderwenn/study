import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarkdownSplit from "../components/MarkdownSplit";

describe("MarkdownSplit", () => {
  it("GFM 删除线渲染为 <del>", () => {
    const { container } = render(<MarkdownSplit value="~~删除~~" onChange={() => {}} />);
    expect(container.querySelector("del")).not.toBeNull();
  });

  it("GFM 任务列表渲染为 checkbox", () => {
    const { container } = render(<MarkdownSplit value={"- [ ] 任务"} onChange={() => {}} />);
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("点工具栏加粗按钮 → onChange 收到 **x**", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value="x" onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.selectionStart = 0;
    ta.selectionEnd = 1;
    await user.click(container.querySelector('button[title*="加粗"]')!);
    expect(onChange).toHaveBeenCalledWith("**x**");
  });
});
