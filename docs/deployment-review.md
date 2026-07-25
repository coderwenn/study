# 笔记网站部署方案审查报告

> 审查日期：2026-07-09
> 审查范围：`docker-compose.yml`、`deploy/`、`apps/api/Dockerfile`、`apps/api/app/`、`docs/deploy.md` 及相关配置
> 审查者：DevOps Automator

---

## 一、部署架构概述

### 1.1 整体架构

当前部署基于 **Docker Compose 单机编排**，在单台 Linux VPS 上运行三个容器化服务，由 Caddy 统一承接入口流量并分发到后端。

```
                    互联网用户
                        │
                  :80 / :443 (HTTP/HTTPS)
                        │
                ┌───────▼────────┐
                │     caddy      │  Caddy 2 (Alpine)
                │  静态前端 + 反代 │  证书: deploy/certs/ (acme.sh DNS-01)
                │  HTTPS 终结     │  数据: caddy_data / caddy_config 卷
                └───┬────────┬───┘
           /api/*   │        │  chat.coderwenn.cloud
                    │        │
              ┌─────▼──┐  ┌──▼──────────┐
              │  api   │  │  open-webui  │
              │ uvicorn │  │  (AI 聊天)   │
              │ :8000  │  │   :8080      │
              └───┬────┘  └──────┬───────┘
                  │              │
          ┌───────▼──────┐       │ host.docker.internal:8642
          │ notes-data   │       └──→ Hermes LLM (宿主机进程)
          │ (SQLite 卷)   │
          │ /data/notes.db│
          └──────────────┘
                  │
          /wiki/entries (宿主机 /home/ubuntu/wiki/entries 挂载)
```

### 1.2 服务清单与配置

| 服务 | 镜像/构建 | 端口 | 数据持久化 | 重启策略 |
|------|-----------|------|-----------|---------|
| `api` | 本地构建 (`apps/api/Dockerfile`)，Python 3.13-slim + uvicorn 单进程 | 8000（仅容器内） | `notes-data` 卷 → `/data/notes.db` | `unless-stopped` |
| `open-webui` | `ghcr.nju.edu.cn/open-webui/open-webui:main`（第三方镜像，**未固定 digest**） | 8080（仅容器内） | `open-webui-data` 卷 | `unless-stopped` |
| `caddy` | 本地构建 (`deploy/Dockerfile.caddy`)，多阶段：node:20-slim 构建前端 → caddy:2-alpine | 80/443/443-udp（对外） | `caddy_data` + `caddy_config` 卷 + `deploy/certs` 只读挂载 | `unless-stopped` |

### 1.3 网络拓扑

- **单 Bridge 网络**：三个容器共享默认 compose 网络，通过服务名互访（`api:8000`、`open-webui:8080`）。
- **对外暴露**：仅 Caddy 的 80/443 端口映射到宿主机；`api` 和 `open-webui` 不直接对外。
- **宿主机互通**：`api` 和 `open-webui` 通过 `extra_hosts: host.docker.internal:host-gateway` 访问宿主机上的 Hermes（:8642）。
- **无网络分段**：未区分前端网络 / 后端网络 / 数据库网络，所有容器同网段可达。

### 1.4 负载均衡策略

- **无负载均衡**：单实例部署，Caddy 仅做 `reverse_proxy api:8000` 和 `reverse_proxy open-webui:8080`，无多后端、无健康探测、无故障转移。
- **无上游健康检查**：Caddy 未配置 `health_uri` / `lb_policy`，后端宕机时请求直接 502。

### 1.5 各组件依赖关系

```
caddy ──depends_on──→ api（无 condition，仅启动顺序）
caddy ──depends_on──→ open-webui（无 condition）
api ──host.docker.internal──→ Hermes (宿主机 :8642)  [LLM/总结功能]
api ──volume──→ /wiki/entries ──宿主机──→ Hermes llm-wiki  [发布功能]
open-webui ──host.docker.internal──→ Hermes (宿主机 :8642)
```

> ⚠️ `depends_on` 未使用 `condition: service_healthy`，仅保证容器**启动顺序**，不保证服务**就绪**。Caddy 可能在 api 尚未监听时就开始转发请求。

### 1.6 证书与 HTTPS

- 证书通过 **acme.sh**（DNS-01，DNSPod API）在宿主机签发，写入 `deploy/certs/`。
- Caddy 以 `tls /certs/xxx.crt /certs/xxx.key` 加载静态证书（**未启用 Caddy 内置 ACME 自动签发**）。
- 续期由 acme.sh 的 cron 触发，续期后执行 `docker compose restart caddy`。
- 域名：`coderwenn.cloud` / `www.coderwenn.cloud`（笔记应用）、`chat.coderwenn.cloud`（Open WebUI）。

---

## 二、部署流程说明

### 2.1 当前部署流程（全手动）

```
开发者本地                        生产服务器
──────────                        ──────────
git commit & push
        │
        ▼  (通过 SSH / CI 触发，但当前无 CI)
        │                   1. ssh 登录服务器
        │                   2. cd notes-app && git pull
        │                   3. cp .env.example .env（仅首次）
        │                   4. 填写 SECRET_KEY / HERMES_API_KEY / LLM_* 等
        │                   5. docker compose up -d --build
        │                      ├─ 构建 api 镜像（pip install from 清华镜像源）
        │                      ├─ 构建 caddy 镜像（pnpm build 前端 → 拷入 caddy）
        │                      └─ 拉取 open-webui:main 镜像
        │                   6. curl http://localhost/api/health 验证
        ▼
    （无自动化测试门禁）
    （无回滚机制）
```

### 2.2 流程各阶段分析

| 阶段 | 当前状态 | 问题 |
|------|---------|------|
| **代码提交** | 手动 push 到 git 远程 | 无分支保护、无 commit 规范校验 |
| **构建** | 在服务器上 `docker build` | 无远程镜像仓库、无构建缓存共享、无构建产物版本化 |
| **测试** | 无（部署流程中不跑测试） | 后端有 pytest 测试套件、前端有 vitest，但部署时**完全不执行** |
| **安全扫描** | 无 | 无依赖漏洞扫描、无镜像扫描、无 SAST |
| **发布** | `docker compose up -d --build` | **有停机窗口**：容器重建期间请求中断 |
| **健康检查** | 手动 `curl /api/health` | 无自动化就绪探测、无发布后自动验证 |
| **回滚** | 手动 `git revert` + 重新 `build` | 无快速回滚、无历史镜像保留、回滚耗时等于完整重建 |

### 2.3 证书续期流程（半自动）

```
acme.sh cron (每日检查)
    │ 到期前 30 天触发续期
    ▼
acme.sh --issue --dns dns_dp（DNSPod API 验证）
    │
    ▼
acme.sh --install-cert → deploy/certs/ → reloadcmd: docker compose restart caddy
```

> 依赖宿主机 cron 和 acme.sh 安装，非容器化管理；DNSPod Token 明文存于宿主机环境变量。

### 2.4 数据备份流程（纯手动）

```bash
docker compose exec api cat /data/notes.db > notes-backup-$(date +%F).db
```

- 无定时任务、无异地备份、无备份完整性校验、无恢复演练。

---

## 三、问题分析

以下按**严重程度**分级（🔴 严重 / 🟠 中等 / 🟡 轻微），每项标注影响范围。

### 🔴 严重问题

#### P0-1. 无 CI/CD 流水线，部署完全手工
- **现象**：无 GitHub Actions / GitLab CI 配置文件（`.github/` 不存在）。所有部署依赖人工 SSH 登录执行 `git pull && docker compose up --build`。
- **影响范围**：全系统。人为操作失误（漏跑测试、环境变量填错、误删数据卷）概率高，且无法追溯。
- **风险**：部署一致性无保障；一次手误可能长时间中断服务且无人知晓。

#### P0-2. 部署流程不执行任何测试
- **现象**：后端有 11 个测试文件（`tests/test_*.py`），前端有 vitest，但部署流程**零测试门禁**。可以直接把未通过测试的代码部署到生产。
- **影响范围**：后端 API + 前端。回归缺陷直接面向用户。
- **风险**：代码质量不可控；一次 bad push 即可让线上功能损坏。

#### P0-3. 无自动化回滚机制
- **现象**：无镜像仓库、无历史镜像版本。回滚 = `git revert` + 重新 `docker build`（耗时数分钟）。期间服务中断。
- **影响范围**：全系统。故障恢复时间（MTTR）不可控。
- **风险**：发布失败时手动救火，延长停机时间。

#### P0-4. 无监控与告警体系
- **现象**：无 Prometheus / Grafana / 告警通道。唯一的可观测手段是 `docker compose logs` 和手动 `curl /api/health`。
- **影响范围**：全系统。CPU 飙高、磁盘写满、SQLite 锁死、证书过期、服务 OOM 均无法及时发现。
- **风险**：故障发现滞后于用户投诉，MTTD（平均检测时间）无上限。

#### P0-5. 容器以 root 运行
- **现象**：`api` 容器需 root 权限以执行 `os.chown`（wiki 发布功能，见 `wiki_publish_service.py`）；Caddy / open-webui 未显式指定非 root 用户。
- **影响范围**：后端容器。若 RCE 漏洞被利用，攻击者直接获得容器 root，进而通过 `host.docker.internal` 或挂载卷横向渗透宿主机。
- **风险**：容器逃逸攻击面大，数据泄露与宿主机失陷。

#### P0-6. 鉴权端点无限流（暴力破解风险）
- **现象**：`/api/auth/login` 和 `/api/auth/register` 无任何限流（rate limiter 仅用于 `/api/summarize`）。登录接口可被无限次尝试。
- **影响范围**：账户安全。弱密码账户可被暴力破解。
- **风险**：用户账户被接管，数据泄露。

### 🟠 中等问题

#### P1-1. SQLite 用于生产，无高可用
- **现象**：数据库为单文件 SQLite（`/data/notes.db`），挂载在 Docker 卷上。无主从复制、无故障转移、写操作全表锁。
- **影响范围**：数据层。并发写入时锁竞争；磁盘损坏即数据全失（卷无冗余）。
- **风险**：中等并发下性能下降；单点故障无兜底。个人量级尚可，多用户场景不可接受。

#### P1-2. 无数据库迁移工具
- **现象**：`init_db()` 使用 `Base.metadata.create_all()` 建表，注释明确写"生产应使用 Alembic 迁移"。无任何迁移脚本。
- **影响范围**：后端。表结构变更（加列、改类型）无法安全增量执行，只能 drop 重建（丢数据）或手动 SQL。
- **风险**：schema 演进困难，易引发数据不一致。

#### P1-3. 部署有停机窗口
- **现象**：`docker compose up -d --build` 会**重建并替换容器**，重建期间该服务不可用（Caddy 返回 502）。无蓝绿 / 金丝雀部署。
- **影响范围**：每次发布。停机窗口取决于构建速度（数秒到数分钟）。
- **风险**：用户在发布瞬间遇到请求失败。

#### P1-4. 无容器健康检查
- **现象**：`docker-compose.yml` 中三个服务均**未定义 `healthcheck`**。`depends_on` 未用 `condition: service_healthy`。
- **影响范围**：全部容器。Caddy 可能在 api 未就绪时转发请求；docker 不会自动重启"假死"容器（进程在但服务不响应）。
- **风险**：服务就绪判断缺失，故障自愈能力弱。

#### P1-5. 无容器资源限制
- **现象**：未配置 `deploy.resources.limits`（内存/CPU）。一个服务内存泄漏可能拖垮整台宿主机。
- **影响范围**：全部容器 + 宿主机。OOM 可能影响所有服务。
- **风险**：单服务故障级联扩散。

#### P1-6. 无定时备份与异地备份
- **现象**：备份纯手动（`docker compose exec cat`），无 cron、无对象存储异地副本、无备份完整性校验、无恢复演练。
- **影响范围**：数据层。宿主机磁盘故障 / 误删卷 → 数据永久丢失。
- **风险**：数据不可恢复，无 RPO 保障。

#### P1-7. 证书管理脆弱
- **现象**：使用外部 acme.sh（非 Caddy 内置 ACME），证书存于宿主机 `deploy/certs/`，依赖宿主机 cron 续期。DNSPod Token 明文存于 shell 环境变量。未启用 Caddy 的 `tls internal` 备选或 `on_demand_tls`。
- **影响范围**：HTTPS 入口。续期失败 → 证书过期 → 浏览器拦截 / 服务不可达。
- **风险**：续期链路长且脆弱，任一环节失败即 HTTPS 中断。

#### P1-8. 无环境隔离（无 staging）
- **现象**：只有一套生产环境，代码直接从 main 分支部署到线上。无预发布环境验证。
- **影响范围**：全系统。未经生产环境验证的变更直接面向用户。
- **风险**：缺陷在生产才暴露。

#### P1-9. 依赖镜像未固定 digest
- **现象**：`open-webui:main` 使用可变标签；`caddy:2-alpine`、`python:3.13-slim`、`node:20-slim` 虽相对稳定但未 pin digest。`open-webui:main` 每次拉取可能拿到不同版本。
- **影响范围**：构建可重复性。同一份代码两次构建可能产出不同镜像。
- **风险**：供应链安全 + 构建不可复现。

#### P1-10. 无依赖漏洞扫描
- **现象**：无 Dependabot / Renovate / `npm audit` / `pip-audit` / Trivy 镜像扫描。Python 依赖（fastapi、httpx、trafilatura 等）和 npm 依赖的已知 CVE 无法及时发现。
- **影响范围**：全栈。供应链漏洞长期潜伏。
- **风险**：已知漏洞被利用。

#### P1-11. 无结构化日志与日志聚合
- **现象**：日志走 stdout（`docker logs`），无 JSON 结构化、无日志聚合（ELK / Loki）、无日志保留策略。宿主机 docker 日志无大小限制（可能写满磁盘）。
- **影响范围**：排障能力。问题排查需逐个 `docker logs`，无法关联跨服务调用链。
- **风险**：故障定位慢，日志无上限可能撑爆磁盘。

### 🟡 轻微问题

#### P2-1. 限流器为内存级，多 worker 不一致
- **现象**：`rate_limiter.py` 注释明确"多 worker 下每个 worker 各自计数 → 近似"。当前单 worker 暂无影响，但水平扩展后限流失效。
- **影响范围**：`/api/summarize` 限流。
- **风险**：未来扩展时限流不准。

#### P2-2. Open WebUI 开放注册
- **现象**：`ENABLE_SIGNUP: "true"`，任何人可注册聊天账号。
- **影响范围**：chat 子域。资源被滥用 / 数据被注入。
- **风险**：个人项目可接受，但需知晓。

#### P2-3. 无 JWT 吊销机制
- **现象**：JWT 无 `jti`（token ID），无法主动吊销已签发的 token。用户改密码 / 退出登录后旧 token 仍有效到过期。
- **影响范围**：会话安全。
- **风险**：token 泄露后无法即时失效。

#### P2-4. 弱默认密钥残留
- **现象**：`config.py` 中 `secret_key: str = "dev-secret-change-me"`。虽然 compose 用 `${SECRET_KEY:?}` 强制注入，但若直接 `uv run uvicorn` 启动（不走 compose）会用弱密钥。
- **影响范围**：开发环境误用。
- **风险**：低，但应加启动校验。

#### P2-5. 无网络分段
- **现象**：所有容器同一默认网络，open-webui 可直接访问 api:8000（虽然无对外端口）。
- **影响范围**：内部隔离。
- **风险**：低，纵深防御不足。

#### P2-6. 配置缺少启动校验
- **现象**：除 `SECRET_KEY` / `HERMES_API_KEY`（compose 强制）外，`LLM_*` / `WIKI_*` 无启动校验，功能静默关闭（返回 503）而非启动报错。
- **影响范围**：可观测性。功能关闭无告警。
- **风险**：低，用户需手动发现功能不可用。

---

## 四、优化建议（按优先级排序）

### P0 — 立即执行（安全与可用性底线）

#### 1. 建立 CI/CD 流水线 ⭐ 最高优先级
**目标**：代码 push 即自动构建、测试、扫描，通过后才允许部署。

**方案**（GitHub Actions）：
```yaml
# .github/workflows/ci.yml 核心阶段
jobs:
  test-api:
    - cd apps/api && uv run pytest          # 后端测试门禁
  test-web:
    - cd apps/web && pnpm test -- --run     # 前端测试门禁
  security-scan:
    - pip-audit / npm audit                 # 依赖漏洞
    - trivy image (构建后镜像扫描)
  build-and-push:
    needs: [test-api, test-web, security-scan]
    - docker build → push 到镜像仓库（带 git sha tag）
```
**收益**：杜绝未通过测试的代码进入生产；构建产物版本化可回滚。

#### 2. 引入镜像仓库 + 版本化部署
**目标**：每次构建产出带版本 tag 的镜像，部署从仓库拉取而非现场构建。

**方案**：使用 GHCR（GitHub Container Registry）或私有 Harbor。
```yaml
# docker-compose.prod.yml
services:
  api:
    image: ghcr.io/<org>/notes-api:${GIT_SHA}  # 替代 build
```
**收益**：秒级回滚（切换 tag 即可）；构建与部署解耦；服务器无需安装构建工具链。

#### 3. 建立自动化回滚机制
**目标**：发布失败后 1 分钟内回滚到上一可用版本。

**方案**：
- 镜像保留最近 N 个版本（仓库策略）。
- 部署脚本记录当前版本，失败时 `docker compose up -d --no-build` 回退到上一 tag。
- 或使用 Docker Compose 的 `COMPOSE_PROFILES` 做蓝绿（见下）。

#### 4. 接入监控与告警
**目标**：关键指标异常 5 分钟内告警。

**方案**（轻量级，适配单机）：
- **指标**：`caddy`（请求数 / 延迟 / 5xx）、`api`（FastAPI Prometheus middleware 暴露 `/metrics`）、宿主机（node-exporter）。
- **存储 + 可视化**：Prometheus + Grafana（一个 compose 服务）。
- **告警**：Alertmanager → 邮件 / Server酱 / Bark。
- **健康检查**：Uptime Kuma 定时探测 `https://coderwenn.cloud/api/health`。

#### 5. 容器安全加固
**目标**：消除 root 运行、限制权限。

**方案**：
```dockerfile
# apps/api/Dockerfile 末尾
RUN useradd -r -u 1000 appuser && chown -R appuser /data /app
USER appuser
```
- Wiki chown 改为：容器以非 root 运行，通过宿主机 sidecar 或 init 容器处理属主；或放弃 chown，用共享 gid 组。
- 加 `security_opt: [no-new-privileges:true]`、`cap_drop: [ALL]`、`read_only: true`（配合 `tmpfs`）。

#### 6. 鉴权端点限流
**目标**：防止登录暴力破解。

**方案**：引入 `slowapi`（FastAPI 限流库）或 Caddy 层 `rate_limit` 插件：
```python
# /api/auth/login 限制 10次/分钟/IP
@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
def login(request: Request, ...): ...
```

---

### P1 — 近期执行（可靠性与可维护性）

#### 7. 迁移到 PostgreSQL（当用户增长时）
**目标**：获得主从复制、并发写、在线备份能力。
**方案**：`docker-compose` 加 `postgres:16` 服务，`DATABASE_URL` 切换，SQLAlchemy 无需改业务代码。SQLite 适合当前单用户阶段，但应预设迁移路径。

#### 8. 引入 Alembic 数据库迁移
**目标**：schema 变更可追溯、可回滚。
**方案**：
```bash
cd apps/api && uv add alembic
alembic init alembic            # 初始化
alembic revision --autogenerate -m "init"  # 生成迁移
alembic upgrade head           # 部署时执行
```
替代 `init_db()` 的 `create_all()`。

#### 9. 实现零停机部署
**目标**：发布期间用户无感知。

**方案 A（轻量，蓝绿）**：
```yaml
# 两个 api 服务：api-blue / api-green，Caddy 指向 active
# 部署脚本：build green → 健康检查 → 切换 Caddy upstream → 停 blue
```
**方案 B（滚动）**：迁移到 Docker Swarm / K8s，`replicas: 2` + `maxUnavailable: 0`。

#### 10. 容器健康检查
**目标**：故障自愈 + 就绪判断。

**方案**：
```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
  caddy:
    depends_on:
      api: { condition: service_healthy }
      open-webui: { condition: service_healthy }
```

#### 11. 自动化定时备份 + 异地存储
**目标**：RPO ≤ 24h，可验证恢复。

**方案**：
```yaml
# 新增 backup 服务（基于 alpine + sqlite3）
backup:
  image: alpine
  command: |
    sh -c "while true; do sleep 86400;
      docker compose exec -T api sqlite3 /data/notes.db '.backup /tmp/bak.db';
      cat /tmp/bak.db | rclone rcat remote:backup/notes-$(date +%F).db;
    done"
```
- 每日备份到对象存储（S3 / COS / R2）。
- 定期恢复演练（每月）。

#### 12. 证书管理容器化
**目标**：消除宿主机 acme.sh 依赖，用 Caddy 内置 ACME 或 lego 容器。

**方案 A**：启用 Caddy 内置 ACME（需 80/443 可达，国内需备案）。
**方案 B**：用 `certbot/dns-dnspod` 容器 + cron sidecar，证书放共享卷，DNSPod Token 通过 Docker secret 注入。

#### 13. 依赖镜像固定 digest + 依赖扫描自动化
**目标**：构建可复现 + 供应链安全。
**方案**：
```yaml
open-webui:
  image: ghcr.nju.edu.cn/open-webui/open-webui:main@sha256:<digest>
```
CI 中加 Renovate 自动提 PR 升级依赖。

#### 14. 结构化日志 + 日志聚合
**目标**：日志可检索、可关联、有保留策略。

**方案**：
- 后端：`structlog` 或 `python-json-logger`，输出 JSON。
- 聚合：Loki + Promtail（轻量，与 Grafana 同栈）。
- Docker logging driver 设 `json-file` + `max-size: 10m` + `max-file: 3`。

#### 15. 建立预发布环境
**目标**：变更先在 staging 验证。

**方案**：用 Docker Compose profiles 在同机起一套 staging（不同端口），或用单独的 staging 分支 + 便宜的小规格 VPS。至少跑通健康检查与冒烟测试再合并到生产分支。

---

### P2 — 后续优化（增强与加固）

#### 16. 限流器迁移到 Redis
将 `/api/summarize` 的内存限流改为 Redis-backed（`aioredis` + 滑动窗口），支持多 worker 一致性。

#### 17. JWT 引入吊销机制
- 加入 `jti`（token ID）+ Redis 黑名单。
- 改密码时吊销该用户所有未过期 token。
- 实现 refresh token 轮换（每次刷新签发新 refresh，旧的失效）。

#### 18. 网络分段
```yaml
networks:
  frontend: {}    # caddy
  backend: {}     # api + open-webui + db
# caddy 同时在 frontend + backend；api 只在 backend
```

#### 19. 配置启动校验
在 `Settings` 中对 `LLM_*` / `WIKI_*` 加 `@field_validator`，启动时若功能预期开启但配置不全则**启动失败**而非静默 503。

#### 20. 服务器配置管理 IaC
用 Ansible playbook 管理服务器初始化（Docker 安装、防火墙、acme.sh、cron），纳入版本控制，可复现部署。

---

## 五、优化路线图总结

| 优先级 | 建议 | 预期收益 | 复杂度 |
|--------|------|---------|--------|
| **P0** | CI/CD 流水线 | 部署自动化、测试门禁 | 中 |
| **P0** | 镜像仓库 + 版本化 | 快速回滚、构建复现 | 低 |
| **P0** | 自动化回滚 | MTTR < 1min | 低 |
| **P0** | 监控告警 | 故障 5min 内发现 | 中 |
| **P0** | 容器安全加固 | 消除 root 攻击面 | 低 |
| **P0** | 鉴权限流 | 防暴力破解 | 低 |
| **P1** | PostgreSQL 迁移 | 高可用、并发写 | 中 |
| **P1** | Alembic 迁移 | schema 可演进 | 低 |
| **P1** | 零停机部署 | 发布无中断 | 中 |
| **P1** | 健康检查 | 自愈 + 就绪判断 | 低 |
| **P1** | 自动备份 | RPO 保障 | 低 |
| **P1** | 证书容器化 | 消除宿主机依赖 | 中 |
| **P1** | 镜像 digest 固定 | 供应链安全 | 低 |
| **P1** | 日志聚合 | 排障效率 | 中 |
| **P1** | 预发布环境 | 缺陷前置发现 | 中 |
| **P2** | Redis 限流 | 多 worker 一致 | 低 |
| **P2** | JWT 吊销 | 会话可控 | 低 |
| **P2** | 网络分段 | 纵深防御 | 低 |
| **P2** | 配置校验 | 启动即暴露问题 | 低 |
| **P2** | IaC (Ansible) | 服务器可复现 | 中 |

---

## 六、结论

当前部署方案对**个人单用户量级**基本可用，架构简洁（Caddy + uvicorn + SQLite + Open WebUI），上手快、资源占用低。Dockerfile 多阶段构建、`.dockerignore`、compose 强制 `SECRET_KEY` 注入等细节体现了安全意识。

但作为生产部署，存在**系统性短板**：

1. **零自动化**：无 CI/CD、无测试门禁、无监控、无自动备份——可靠性完全依赖人工警觉。
2. **单点无兜底**：单机、单实例、单文件数据库、无健康检查、无回滚——任何环节故障都是全站故障。
3. **安全纵深不足**：root 运行、登录无限流、无镜像扫描——攻击面偏大。

**建议优先推进 P0 项**（CI/CD + 镜像仓库 + 监控告警 + 安全加固），这是从"能跑"到"可靠"的最短路径。P1 项在用户增长或多服务扩展时再逐步落地。P2 项作为持续加固。

> **一句话总结**：架构选型合理，但缺少"自动化护城河"——补齐 CI/CD、监控、备份三件套后，这套部署可稳定支撑从个人到小团队的过渡。

---

**审查人**：DevOps Automator
**审查日期**：2026-07-09
**文档版本**：v1.0
