import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { useEditorShortcuts } from "../editor/useEditorShortcuts";

// 渲染一个绑定快捷键 hook 的受控 textarea（必须经 React onKeyDown，否则 raw dispatch 不会触发 handler）
function setup(initial = "x") {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const restoreSelection = vi.fn();
  function Editor({ value }: { value: string }) {
    const ref = React.useRef<HTMLTextAreaElement>(null);
    const handleKeyDown = useEditorShortcuts({ ref, value, onChange, onSave, restoreSelection });
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    );
  }
  const utils = render(<Editor value={initial} />);
  const ta = utils.container.querySelector("textarea")!;
  return { ta, onChange, onSave, restoreSelection };
}

describe("useEditorShortcuts", () => {
  it("IME 组合态不触发任何命令", () => {
    const { ta, onChange } = setup();
    ta.focus();
    fireEvent.keyDown(ta, { key: "b", code: "KeyB", metaKey: true, isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("⌘B 触发 bold（fallback 下 onChange 收到 **x**）", () => {
    const { ta, onChange } = setup();
    ta.focus();
    ta.setSelectionRange(0, 1); // 选中 "x"
    fireEvent.keyDown(ta, { key: "b", code: "KeyB", metaKey: true });
    expect(onChange).toHaveBeenCalledWith("**x**");
  });

  it("⌘S 调用 onSave", () => {
    const { ta, onSave } = setup();
    ta.focus();
    fireEvent.keyDown(ta, { key: "s", code: "KeyS", metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Tab 触发 indent（onChange 收到 \"  x\"）", () => {
    const { ta, onChange } = setup();
    ta.focus();
    ta.setSelectionRange(0, 0); // 光标在行首
    fireEvent.keyDown(ta, { key: "Tab", code: "Tab" });
    expect(onChange).toHaveBeenCalledWith("  x");
  });
});
