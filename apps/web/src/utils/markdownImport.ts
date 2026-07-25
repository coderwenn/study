// Markdown 导入解析：纯函数，无副作用，方便单测。
// 与「导出 .md」（NoteEditor.exportMd：`# 标题\n\n正文`）形成对称——
// 导入时优先复用 frontmatter title / 首个 H1，避免标题与正文重复。
//
// 标题优先级：
//   1. YAML frontmatter 中的 `title:` 字段
//   2. 正文中第一个行首 `# ` 的 H1（跳过 ``` 代码块）
//   3. 文件名（去扩展名、去序号前缀、分隔符转空格）
//
// 正文处理：
//   - 有 frontmatter 时剥离整个 frontmatter 块
//   - 标题取自 H1 时，从正文剥离该 H1 行，避免重复
//   - 其他情况正文保持原样（仅 trim 尾部空白）

export interface ParsedMarkdown {
  title: string;
  content: string;
}

export interface ParsedMarkdownFile extends ParsedMarkdown {
  filename: string;
}

// 受支持的扩展名（不区分大小写）
const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

/**
 * 从文件名推导标题：去扩展名 → 去序号前缀（01- / 01_ / 001.）→ 分隔符转空格 → trim
 */
function titleFromFilename(filename: string): string {
  const base = filename.replace(MD_EXT, "");
  // 去掉常见前缀序号：01-、01_、001.、01 等
  const cleaned = base.replace(/^\d+[-_.]\s*/, "");
  // 把 - / _ 换成空格
  const withSpaces = cleaned.replace(/[-_]+/g, " ").trim();
  // 全空或纯符号时回退到原始 base，避免空标题
  return withSpaces || base;
}

/**
 * 拆分 YAML frontmatter：仅做轻量解析，支持 `key: value` 与 `key: 'value'` / `key: "value"`。
 * 不支持的复杂结构（数组、嵌套对象）会被忽略——笔记导入场景足够用。
 */
function splitFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  // frontmatter 必须在文件开头，以 --- 开头
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!m) return { frontmatter: {}, body: text };
  const raw = m[1];
  const body = text.slice(m[0].length);
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    // 去掉引号包裹
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    frontmatter[mm[1]] = v;
  }
  return { frontmatter, body };
}

/**
 * 在正文中找第一个 H1（行首 `# `），跳过 ``` 围栏代码块。
 * 返回 { title, lineIndex } 或 null。
 */
function findFirstH1(body: string): { title: string; lineIndex: number } | null {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 围栏代码块开关：行首（允许前置空格）的 ```
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return { title: m[1].trim(), lineIndex: i };
  }
  return null;
}

/**
 * 解析 Markdown 文本，提取标题与正文。
 *
 * @param filename 文件名（用于标题回退）
 * @param text    文件文本内容
 */
export function parseMarkdownText(filename: string, text: string): ParsedMarkdown {
  const { frontmatter, body } = splitFrontmatter(text);
  const h1 = findFirstH1(body);

  let title = "";
  let content = body;

  if (frontmatter.title) {
    // 1) frontmatter.title 优先，正文保留（已剥离 frontmatter）
    title = frontmatter.title;
  } else if (h1) {
    // 2) 首个 H1：剥离该 H1 行，避免标题与正文重复
    title = h1.title;
    const lines = body.split(/\r?\n/);
    lines.splice(h1.lineIndex, 1);
    // 剥离 H1 后去掉开头连续的空白行（H1 后常跟空行作分隔），保留正文缩进
    while (lines.length > 0 && lines[0].trim() === "") {
      lines.shift();
    }
    content = lines.join("\n");
  } else {
    // 3) 文件名回退
    title = titleFromFilename(filename);
  }

  // 后端 NoteCreate.title 限制 200 字符
  title = title.trim().slice(0, 200);
  // 正文 trim 尾部空白，保留内部结构
  content = content.replace(/\s+$/, "");

  // 空标题兜底（后端 min_length=1）
  return { title: title || "无标题", content };
}

/**
 * 包装：从 File 读取文本并解析。
 * 使用原生 File.text()（现代浏览器均支持）。
 */
export async function parseMarkdownFile(file: File): Promise<ParsedMarkdownFile> {
  const text = await file.text();
  const parsed = parseMarkdownText(file.name, text);
  return { ...parsed, filename: file.name };
}
