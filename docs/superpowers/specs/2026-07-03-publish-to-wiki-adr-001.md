# ADR-001：发布笔记到 LLM Wiki 的「访问宿主机目录」机制

- 日期：2026-07-03
- 状态：已采纳（Accepted）
- 关联：`docs/superpowers/plans/2026-07-03-publish-to-wiki.md`、`CONTEXT.md`

## 背景

「发布到 Wiki」需要把笔记物化成 `.md` 写进宿主机的 `/home/ubuntu/wiki/entries/`（Hermes llm-wiki 的来源目录）。但 `api` 服务跑在 **Docker 容器**里，容器文件系统与宿主机隔离——容器内根本不存在 `/home/ubuntu/...`，所以「当前服务直接写」必须先解决「容器如何看到宿主机目录」。

此外该目录由宿主机 `ubuntu` 用户下的 Hermes agent / obsidian-headless 读写，而容器默认以 **root** 运行。若直接写出文件归 root 所有，会出现「Hermes 读得到但改/删不了」的权限错配。因此要在选定「写宿主机目录」机制的同时，解决文件属主问题。

> 注意：bind mount **不是另起一个服务**，而是给当前这个 `api` 容器开一扇通到宿主机目录的「窗户」——写的还是同一个 `api` 进程，只是让它能看到那个目录。

## 决策

采用 **bind mount + 写后 `os.chown` 到宿主机 uid**。

- 在 `docker-compose.yml` 的 `api` 服务加一行 bind mount：宿主机 `/home/ubuntu/wiki/entries` ↔ 容器 `/wiki/entries`。**只挂这一个子目录**（最小权限），不碰 `SCHEMA.md` / `index.md` / `log.md` 等 wiki 导航骨架。
- 容器**仍以 root 运行**——不动 `/data` SQLite 卷的 root 所有权，避免数据迁移。
- 写文件后用 `os.chown(path, WIKI_UID, WIKI_GID)` 把属主改成配置的宿主机 uid/gid（如 ubuntu 的 `1000:1000`）。root 进程有权 chown 成任意 uid，所以文件天然归 `ubuntu`，Hermes / obsidian 既能读也能改。
- 未配置 `WIKI_ENTRIES_PATH` / `WIKI_OWNER` 时端点返回 **503**，功能默认关闭（优雅降级）。

## 备选方案

### 方案 B：额外起一个 sidecar 服务

新起一个小服务专门拥有 wiki 写权限、暴露「写文件」HTTP API，`api` 容器调用它。

- 优点：`api` 容器完全不碰宿主机目录，隔离更彻底。
- 缺点：多一个进程 / 镜像 / 网络跳点，个人项目过度设计；而且权限问题只是从 `api` 搬到 sidecar，并未消除。

### 方案 C：把 `api` 容器 `user` 改为 `1000:1000`

让容器以 ubuntu 身份运行，写的文件天然属 ubuntu，无需 chown。

- 优点：语义最干净，无需 chown。
- 缺点：现有 `/data` SQLite 卷是 root 所有，切到 `1000` 后 SQLite 无法写入，需要**停服 + `chown` 整个数据卷**的迁移步骤，风险与收益不划算。

### 方案 D：容器内 SSH / SCP 到宿主机

容器塞 SSH 私钥，用 scp 写宿主机。

- 缺点：把私钥弄进镜像 / 容器、多一层网络与认证面，毫无收益。

## 后果

- **正面**：一行 compose 改动即打通；属主正确，Hermes / obsidian 可读可改；`api` 容器与 SQLite 卷零迁移；未配置时优雅降级（503）。
- **负面 / 风险**：
  - bind mount 把宿主机路径耦合进 compose（部署文档需写明：宿主机目录存在、且属主正确）。
  - `os.chown` 依赖容器以 root 运行；若未来加固成非 root 容器，chown 会失败——届时需切到方案 C 并一并迁移 `/data`。
  - 宿主机 uid 写死在 env，换机器 / 换用户需同步改 `WIKI_UID` / `WIKI_GID`。
- **缓释**：`WIKI_UID` / `WIKI_GID` 默认 `0`（不 chown，留 root:0644 可读），仅在需要 Hermes / obsidian 原地改写时才配置；功能开关由 `WIKI_ENTRIES_PATH` 是否为空控制。

## 备注

llm-wiki 的来源（`raw/`）按约定是**只读**的（"agent reads but never modifies"），所以即便不 chown、文件留 `root:root` + `0644`，Hermes 也能正常 ingest；chown 是为 obsidian-headless 等需要原地改写的场景更顺。挂载范围严格限定在 `entries/`，避免容器误改 wiki 的导航骨架。
