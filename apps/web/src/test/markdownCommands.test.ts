import { describe, it, expect } from "vitest";
import { applyEdit } from "../editor/types";
import { bold, italic, strikethrough, inlineCode, link } from "../editor/markdownCommands";

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

describe("bold", () => {
  it("选中文本 → 包裹 **", () => {
    const e = bold({ value: "加粗", selectionStart: 0, selectionEnd: 2 });
    const r = applyEdit({ value: "加粗", selectionStart: 0, selectionEnd: 2 }, e);
    expect(r.value).toBe("**加粗**");
  });

  it("无选区 → 插入 **** 光标居中", () => {
    const e = bold({ value: "", selectionStart: 0, selectionEnd: 0 });
    const r = applyEdit({ value: "", selectionStart: 0, selectionEnd: 0 }, e);
    expect(r.value).toBe("****");
    expect(r.selectionStart).toBe(2);
    expect(r.selectionEnd).toBe(2);
  });

  it("已包裹 **x** → 去包裹", () => {
    const s = { value: "**加粗**", selectionStart: 2, selectionEnd: 4 };
    const e = bold(s);
    const r = applyEdit(s, e);
    expect(r.value).toBe("加粗");
  });
});

describe("inline 包裹类（italic/strike/code）", () => {
  it("italic 选中文本 → *x*", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, italic(s)).value).toBe("*x*");
  });
  it("strikethrough → ~~x~~", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, strikethrough(s)).value).toBe("~~x~~");
  });
  it("inlineCode → `x`", () => {
    const s = { value: "x", selectionStart: 0, selectionEnd: 1 };
    expect(applyEdit(s, inlineCode(s)).value).toBe("`x`");
  });
});

describe("link", () => {
  it("选中文本 → [文本](url)", () => {
    const s = { value: "链接", selectionStart: 0, selectionEnd: 2 };
    const e = link(s);
    const r = applyEdit(s, e);
    expect(r.value).toBe("[链接](url)");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("url");
  });
  it("无选区 → [链接文本](url) 选区落在「链接文本」", () => {
    const s = { value: "", selectionStart: 0, selectionEnd: 0 };
    const r = applyEdit(s, link(s));
    expect(r.value).toBe("[链接文本](url)");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("链接文本");
  });
});
