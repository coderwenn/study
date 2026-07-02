import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
});
