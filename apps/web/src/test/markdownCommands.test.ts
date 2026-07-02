import { describe, it, expect } from "vitest";
import { applyEdit } from "../editor/types";

describe("applyEdit", () => {
  it("用 insert 替换 [start,end) 并更新选区", () => {
    const next = applyEdit(
      { value: "hello world", selectionStart: 0, selectionEnd: 5 },
      { deleteStart: 0, deleteEnd: 5, insert: "HELLO", selectStart: 1, selectEnd: 3 }
    );
    expect(next.value).toBe("HELLO world");
    expect(next.selectionStart).toBe(1);
    expect(next.selectionEnd).toBe(3);
  });

  it("insert 为空即纯删除", () => {
    const next = applyEdit(
      { value: "abc", selectionStart: 1, selectionEnd: 2 },
      { deleteStart: 1, deleteEnd: 2, insert: "", selectStart: 1, selectEnd: 1 }
    );
    expect(next.value).toBe("ac");
  });
});
