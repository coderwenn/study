// markdownImport 解析工具单测
// 覆盖：H1 标题、frontmatter title、文件名回退、引号包裹、代码块内 H1 跳过、序号前缀、空文件等
import { describe, it, expect } from "vitest";
import { parseMarkdownText } from "../utils/markdownImport";

describe("parseMarkdownText", () => {
  it("从首个 H1 提取标题并从正文剥离该 H1 行", () => {
    const r = parseMarkdownText("note.md", "# Hello World\n\n正文内容");
    expect(r.title).toBe("Hello World");
    expect(r.content).toBe("正文内容");
  });

  it("frontmatter.title 优先于 H1，正文保留 H1", () => {
    const text = "---\ntitle: Frontmatter Title\ndate: 2024-01-01\n---\n# H1 Heading\n\n正文";
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("Frontmatter Title");
    // 正文应保留 H1（仅剥离了 frontmatter）
    expect(r.content).toBe("# H1 Heading\n\n正文");
  });

  it("frontmatter.title 支持双引号包裹", () => {
    const text = '---\ntitle: "Quoted Title"\n---\nbody';
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("Quoted Title");
  });

  it("frontmatter.title 支持单引号包裹", () => {
    const text = "---\ntitle: 'Single Quoted'\n---\nbody";
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("Single Quoted");
  });

  it("无 frontmatter 且无 H1 时回退到文件名（去扩展名 + 分隔符转空格）", () => {
    const r = parseMarkdownText("my-note.md", "只有正文，没有标题");
    expect(r.title).toBe("my note");
    expect(r.content).toBe("只有正文，没有标题");
  });

  it("文件名带序号前缀时去除序号", () => {
    const r = parseMarkdownText("01-my-note.md", "正文");
    expect(r.title).toBe("my note");
  });

  it("文件名下划线分隔符转为空格", () => {
    const r = parseMarkdownText("a_b_c.md", "正文");
    expect(r.title).toBe("a b c");
  });

  it("支持 .markdown 扩展名", () => {
    const r = parseMarkdownText("note.markdown", "正文");
    expect(r.title).toBe("note");
  });

  it("代码块内的 # 行不作为 H1 提取", () => {
    const text = "```\n# Not A Heading\n```\n正文";
    const r = parseMarkdownText("fallback.md", text);
    // 没有 H1（代码块内被跳过）→ 回退文件名
    expect(r.title).toBe("fallback");
    // 正文完整保留（含代码块）
    expect(r.content).toBe("```\n# Not A Heading\n```\n正文");
  });

  it("跳过代码块后正确提取代码块外的首个 H1", () => {
    const text = "```\n# fake\n```\n# Real H1\n正文";
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("Real H1");
    // 剥离 H1 行，保留代码块
    expect(r.content).toBe("```\n# fake\n```\n正文");
  });

  it("空文件回退文件名", () => {
    const r = parseMarkdownText("empty.md", "");
    expect(r.title).toBe("empty");
    expect(r.content).toBe("");
  });

  it("只有 H1 没有正文时，content 为空", () => {
    const r = parseMarkdownText("note.md", "# Solo Heading");
    expect(r.title).toBe("Solo Heading");
    expect(r.content).toBe("");
  });

  it("无扩展名文件直接用文件名", () => {
    const r = parseMarkdownText("README", "正文内容");
    expect(r.title).toBe("README");
  });

  it("H1 带尾部空格时 trim", () => {
    const r = parseMarkdownText("note.md", "# Heading with trailing space   \n正文");
    expect(r.title).toBe("Heading with trailing space");
  });

  it("frontmatter 缺少 title 字段时回退到 H1", () => {
    const text = "---\ndate: 2024-01-01\n---\n# From H1\n正文";
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("From H1");
  });

  it("正文尾部空白被 trim", () => {
    const r = parseMarkdownText("note.md", "# Title\n正文\n\n\n");
    expect(r.content).toBe("正文");
  });

  it("标题超过 200 字符时截断（对齐后端限制）", () => {
    const longTitle = "A".repeat(300);
    const r = parseMarkdownText("note.md", `# ${longTitle}\n正文`);
    expect(r.title.length).toBe(200);
  });

  it("H2 不作为标题提取，回退文件名", () => {
    const r = parseMarkdownText("note.md", "## H2 Heading\n正文");
    expect(r.title).toBe("note");
  });

  it("frontmatter 后紧跟 H1 但 frontmatter 有 title 时仍优先 frontmatter", () => {
    const text = "---\ntitle: FM\n---\n# H1\nbody";
    const r = parseMarkdownText("note.md", text);
    expect(r.title).toBe("FM");
    expect(r.content).toBe("# H1\nbody");
  });
});
