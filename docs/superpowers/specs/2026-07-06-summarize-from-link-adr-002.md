# ADR-002：`fetch_page` 的 SSRF 防护姿态

- 日期：2026-07-06
- 状态：已采纳（Accepted）
- 关联：`docs/superpowers/plans/2026-07-06-summarize-from-link.md`、`docs/superpowers/specs/2026-07-06-summarize-from-link-adr-001.md`、`CONTEXT.md`

## 背景

网页总结让服务端去抓「用户粘贴的链接」。这是教科书级 SSRF 向量：攻击者可让服务器去请求 `http://169.254.169.254/...`（云元数据，偷凭据）、内网管理面板（`http://10.0.0.1/admin`）、或用 `file://` / `gopher://` / `data:` 等危险 scheme 读本地资源 / 探测内网。

更糟的是 ADR-001 选了**真·agent**：LLM 可能在一次请求里**多次**调用 `fetch_page`，甚至构造新的 URL 去抓——SSRF 攻击面被放大。因此抓取的 SSRF 防护必须**强、且每次调用都跑**，不能只在入口校验一次。

## 决策

`fetch_page`（以及任何抓取入口）统一走 `validate_url()` 守卫，并叠加传输层限制：

- **scheme 白名单**：仅 `http` / `https`；`file://`、`gopher://`、`data:`、`ftp://` 等一律拒绝。
- **解析后按 IP 段屏蔽**：DNS 解析主机名，任一解析结果落在 loopback（`127/8`、`::1`）、private（`10/8`、`172.16/12`、`192.168/16`、`fc00::/7`）、link-local（`169.254/16` —— **含云元数据 `169.254.169.254`**、`fe80::/10`）、reserved / multicast / unspecified 即拒绝。用 `ipaddress` 标准库判定。
- **重定向：跟随，但逐跳重校验 + 限数**：每个 3xx 跳转目标都重新跑一遍 `validate_url()`，跳转上限（如 5）。既支持短链 / `www→主域` 等合法跳转，又防「先跳到合法 IP、再 302 到内网」。
- **DNS-rebinding 缓释**：校验在「解析后」做，并对每次重定向重校验；v1 不做「解析后 pin 住 IP 再连」的完整 IP-pinning（见「后果」已知残留）。
- **体积上限**：流式读响应，超过阈值（如 5 MB）即中止，防内存炸弹。
- **超时**：连接 + 读取双超时（如 10s 连接 / 30s 总）。
- **Content-Type 闸门**：仅 `text/html` / `application/xhtml+xml` 进入抽取；否则工具返回「不是网页」给 agent。
- **UA**：设置描述性 User-Agent（部分站点拦默认 UA）。
- **入口预校验**：用户提交的 URL 在**进 agent 之前**先 `validate_url()` 一次，违规直接 400，给用户清晰报错；agent 内部每次 `fetch_page` 再校验。

## 备选方案

### 方案 B：一律禁重定向

遇 3xx 直接报错。

- 优点：最简最安全。
- 缺点：`bit.ly` / `t.co` 等短链、大量 `www→主域` / `http→https` 跳转的合法站点直接不可用，覆盖面伤太大。**否决**。

### 方案 C：只校验首跳

入口 URL 校验，跳转目标不再校验。

- 优点：实现最快。
- 缺点：跳转到内网 IP 会**漏过去**——这正是 SSRF 常见绕过。**否决**（仅列出以示对比）。

### 方案 D：完整 IP-pinning

解析 → 校验 → pin 住该 IP，用该 IP 建连并设 Host 头，彻底防 TOCTOU 式 rebinding。

- 优点：最严密。
- 缺点：与 httpx 的连接管理交互复杂（自定义 transport / 按 host 绑定连接池），v1 投入产出比低。**v1 不做，记为已知残留风险**，日后若担心可升级。

## 后果

- **正面**：堵死最常见的 SSRF（云元数据、内网探测、危险 scheme）；逐跳重校验挡住「重定向绕过」；体积/超时上限挡住资源耗尽；Content-Type 闸门让非网页优雅退回给 agent。
- **负面 / 风险**：
  - **已知残留**：同一次请求内的 TOCTOU DNS-rebinding（校验后、建连前主机重新解析到内网 IP）。v1 未做完整 IP-pinning，缓解依据是：仅放行 http/https、解析阶段即屏蔽内网段、且重定向逐跳重校验——实战中 rebinding 多经重定向触发，已覆盖。
  - 逐跳重校验 + 体积上限会让少数「超大或多次跳转」的合法页失败；属可接受取舍。
  - 部分站点需要特定 UA / Cookie 才能取到正文，v1 不处理（fetch 失败回退给 agent 报告）。
- **缓释**：`validate_url()` 是**纯函数**（注入 DNS 解析即可单测，无需真实网络），内网/环回/链路本地/危险 scheme 各有用例覆盖；`fetch_page` 的重定向路径用脚本化响应单测。

## 备注

这份防护「对一个 fetch 来说显得过重」正是它需要 ADR 的原因——别因为「简化」而拆掉 scheme 白名单、IP 屏蔽或逐跳重校验中的任何一项，那会直接打开 SSRF。完整 IP-pinning（方案 D）是日后加固方向，不在 v1。
