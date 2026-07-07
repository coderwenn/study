# 笔记应用 + LLM Wiki 集成

个人笔记应用（`apps/web` + `apps/api`）与服务器上 Hermes 的 llm-wiki 的集成上下文。
本文件只记录领域语言（glossary），不写实现细节。

## Language

**Note (笔记)**:
笔记应用里的一条用户记录——存在 SQLite 的一个数据行（标题 + Markdown 正文 + 标签），按用户隔离。它本身不是文件。
_Avoid_: 文档、page（page 是 wiki 那边的概念）

**Wiki Source (来源)**:
一条 Note 被「物化」后写进 wiki `entries/` 目录的 Markdown 文件，作为 llm-wiki 的原始素材，由 Hermes 之后去 ingest、做交叉引用、综合成正式页面。带轻量 frontmatter 标注来源（origin = 笔记应用），但**不**带交叉引用、不写 index.md/log.md。
_Avoid_: wiki page、文档（page 特指 Hermes 综合产出的 layer-2 页面，来源不是 page）

**导出 (Export)**:
把笔记在浏览器端生成 .md 并下载到用户本地机器（已有功能，纯前端，不碰服务器文件系统）。
_Avoid_: 保存、发布

**发布到 Wiki (Publish to Wiki)**:
服务端把笔记物化成 Wiki Source 写进服务器 `entries/` 目录。无状态：每次按标题 slug 覆盖同一文件，不在 Note 表留字段；改标题会留下旧文件名残骸（孤儿）。
_Avoid_: 导出、保存、同步

**网页总结 (Summarize from Link)**:
用户粘贴一条链接后的一次**无状态**后端动作：抓取并理解该网页，产出一份草稿返回前端。不落库、不写文件；只在用户确认保存后才成为一条 Note。
_Avoid_: 爬虫、采集（这是「理解一条链接」，不是批量抓取）

**草稿 (Draft)**:
网页总结返回前端的临时结果（源链接 + 页面标题 + 总结 + 建议标签），**不持久化**。确认保存后才物化为一条 Note，保存复用现有创建笔记流程，与草稿生命周期无关。
_Avoid_: 临时笔记、缓存、快照
