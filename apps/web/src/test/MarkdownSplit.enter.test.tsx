import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarkdownSplit from "../components/MarkdownSplit";

describe("MarkdownSplit - Enter 续前缀（集成）", () => {
  it("无序列表行尾按 Enter → onChange 收到续行", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value={"- 第一项"} onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.setSelectionRange(5, 5); // 行尾
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenCalledWith("- 第一项\n- ");
  });

  it("有序列表行尾按 Enter → 序号递增", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value={"1. 第一"} onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.setSelectionRange(5, 5);
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenCalledWith("1. 第一\n2. ");
  });

  it("任务列表 - [x] 行尾按 Enter → 新行重置为未勾选", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value={"- [x] 已做"} onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.setSelectionRange(9, 9);
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenCalledWith("- [x] 已做\n- [ ] ");
  });

  it("IME 组合态 Enter 不触发续前缀", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value={"- 列表"} onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.setSelectionRange(4, 4);
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Shift+Enter 不拦截（保留硬换行逃生口）", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownSplit value={"- 列表"} onChange={onChange} />);
    const ta = container.querySelector("textarea")!;
    ta.focus();
    ta.setSelectionRange(4, 4);
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter", shiftKey: true });
    expect(onChange).not.toHaveBeenCalled(); // 不调用 onChange = 不拦截
  });
});

describe("MarkdownSplit - 单 \\n 渲染 <br>（remark-breaks）", () => {
  it("单换行在段落内渲染为 <br>", () => {
    const { container } = render(<MarkdownSplit value={"第一行\n第二行"} onChange={() => {}} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBeGreaterThanOrEqual(1);
    // 至少有一个 <br> 存在（remark-breaks 把段内 \n 转 <br>）
    expect(container.querySelector("br")).not.toBeNull();
  });
});
