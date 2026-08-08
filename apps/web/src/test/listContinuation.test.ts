import { describe, it, expect } from "vitest";
import { applyEdit } from "../editor/types";
import { computeEnterEdit } from "../editor/listContinuation";

const st = (value: string, a: number, b: number = a) => ({ value, selectionStart: a, selectionEnd: b });

describe("computeEnterEdit - 普通行", () => {
  it("普通行回车 → 仅插 \\n，不续前缀", () => {
    const s = st("abc", 3);
    const e = computeEnterEdit(s);
    const r = applyEdit(s, e);
    expect(r.value).toBe("abc\n");
    expect(r.selectionStart).toBe(4);
  });

  it("空文本回车 → 插 \\n", () => {
    const s = st("", 0);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe("\n");
  });
});

describe("computeEnterEdit - 无序列表", () => {
  it("- xxx 行尾回车 → 续 - ", () => {
    const v = "- 第一项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n- ");
    expect(r.selectionStart).toBe(r.value.length);
  });

  it("* xxx → 续 * ", () => {
    const v = "* 项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n* ");
  });

  it("+ xxx → 续 + ", () => {
    const v = "+ 项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n+ ");
  });

  it("缩进子列表 2 空格 - xxx → 续 2 空格 - ", () => {
    const v = "  - 子项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n  - ");
  });
});

describe("computeEnterEdit - 有序列表递增", () => {
  it("1. xxx → 续 2. ", () => {
    const v = "1. 第一";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n2. ");
  });

  it("3. xxx → 续 4. ", () => {
    const v = "3. 项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n4. ");
  });

  it("5) xxx → 续 6) （括号分隔符）", () => {
    const v = "5) 项";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n6) ");
  });
});

describe("computeEnterEdit - 任务列表", () => {
  it("- [ ] xxx → 续 - [ ] （重置未勾选）", () => {
    const v = "- [ ] 任务";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n- [ ] ");
  });

  it("- [x] xxx → 续 - [ ] （即使上行已勾选，新行重置为未勾选）", () => {
    const v = "- [x] 已做";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n- [ ] ");
  });
});

describe("computeEnterEdit - 引用", () => {
  it("> xxx → 续 > ", () => {
    const v = "> 引用";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n> ");
  });
});

describe("computeEnterEdit - 不续前缀的场景", () => {
  it("### 标题 → 不续 ###", () => {
    const v = "### 标题";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });

  it("# 一级标题 → 不续 #", () => {
    const v = "# 标题";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });
});

describe("computeEnterEdit - 空项退出", () => {
  it("空无序项 - → 删除前缀，退出列表", () => {
    const s = st("- ", 2);
    const r = applyEdit(s, computeEnterEdit(s));
    // 整行被删除，回到正文（前一行末尾的换行仍在）
    expect(r.value).toBe("");
  });

  it("空有序项 1. → 删除前缀，退出", () => {
    // 文档里 "first\n1. "，光标在末尾，空项退出删掉 "1. "
    const s = st("first\n1. ", 8);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe("first\n");
  });

  it("空任务项 - [ ] → 删除前缀，退出", () => {
    const s = st("- [ ] ", 6);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe("");
  });

  it("空引用 > → 删除前缀，退出", () => {
    const s = st("> ", 2);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe("");
  });
});

describe("computeEnterEdit - 代码围栏内", () => {
  it("``` 围栏内回车 → 普通换行，不续前缀", () => {
    const v = "```\ncode here";
    const s = st(v, v.length); // 光标在末尾
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });

  it("~~~ 围栏内回车 → 普通换行", () => {
    const v = "~~~js\nconst x = 1";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });

  it("已关闭的围栏之后 → 回到正文行为", () => {
    const v = "```\nx\n```\n正文";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });

  it("围栏内即使行首是 - 也不续前缀", () => {
    const v = "```\n- list inside code";
    const s = st(v, v.length);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe(v + "\n");
  });
});

describe("computeEnterEdit - 多行选区", () => {
  it("选中多行 + 回车 → 整体替换为换行", () => {
    // "a\nb\nc" 选中 [0, 4) = "a\nb\n"（不含 c），剩 "c"
    const v = "a\nb\nc";
    const s = st(v, 0, 4);
    const r = applyEdit(s, computeEnterEdit(s));
    expect(r.value).toBe("\nc");
    expect(r.selectionStart).toBe(1);
  });
});
