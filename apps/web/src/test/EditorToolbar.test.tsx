import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorToolbar } from "../components/EditorToolbar";

describe("EditorToolbar", () => {
  it("渲染全部命令按钮（按 commandOrder）", () => {
    render(<EditorToolbar onCommand={() => {}} />);
    expect(screen.getByTitle(/加粗/)).toBeInTheDocument();
    expect(screen.getByTitle(/表格/)).toBeInTheDocument();
  });

  it("点击加粗按钮 → 调用 onCommand('bold')", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} />);
    await user.click(screen.getByTitle(/加粗/));
    expect(onCommand).toHaveBeenCalledWith("bold");
  });
});
