# 部署优化实施指南

> 生成日期：2026-07-22
> 前置文档：`docs/deployment-review.md`（完整审查报告）
> 适用范围：尚未落地的优化项（已完成项已在文末标注）

本文档针对审查报告中识别的风险，提供**逐项可执行的操作指南**。每项包含：目标、前置条件、分步操作、验证方法、注意事项。

---

## 已完成项（无需重复操作）

| 编号 | 项目 | 状态 |
|------|------|------|
| P0-1 | CI/CD 流水线 | ✅ 已创建 `.github/workflows/ci.yml` |
| P0-4 | 监控-健康检查 | ✅ docker-compose 三服务已配 healthcheck |
| P0-5 | 安全-no-new-privileges | ✅ 已加（但非 root 尚未完成，见下 P0-A） |
| P0-6 | 鉴权端点限流 | ✅ 已实现 login/register per-IP 限流 |
| P1-4 | 容器健康检查 | ✅ 已配 healthcheck + depends_on 条件 |
| P1-5 | 资源限制 | ✅ 已配 deploy.resources.limits |
| P1-6 | 自动备份 | ✅ 已创建 `deploy/backup.sh` |
| P1-11 | 日志上限 | ✅ 已配 json-file max-size 10m × 3 |

---

## P0 — 严重，建议尽快落地

### P0-A. 容器非 root 运行

**目标**：消除后端容器以 root 运行的攻击面。

**难点**：`wiki_publish_service.py` 中的 `os.chown()` 需要 root 权限。直接切非 root 会导致 Wiki 发布功能报错。

**操作步骤**：

1. **修改 `apps/api/Dockerfile`**，在末尾 `CMD` 之前加入：

```dockerfile
# 创建非 root 用户（uid 1000，与宿主机 ubuntu 用户一致）
RUN useradd -r -u 1000 -m -d /home/appuser appuser && \
    chown -R appuser:appuser /data /app /home/appuser
USER appuser
```

2. **修改 `wiki_publish_service.py` 的 chown 逻辑**。因为容器以 uid 1000 运行，写出的文件天然属于 1000:1000，与宿主机 ubuntu 用户一致，**chown 不再需要**：

```python
# publish_note() 中，将 chown 块改为：
# 容器以非 root (uid=1000) 运行，文件天然属于 1000:1000，
# 无需 chown（os.chown 在非 root 下会 PermissionError）
# 如需指定不同 uid/gid，需改用宿主机 sidecar 处理
```

即删除或注释掉：
```python
# if settings.wiki_uid or settings.wiki_gid:
#     os.chown(target, settings.wiki_uid, settings.wiki_gid)
```

3. **修改 `docker-compose.yml` 的 api 服务**，确保挂载的 wiki 目录权限正确：

```yaml
  api:
    # ... 已有配置 ...
    user: "1000:1000"          # 显式指定运行用户
    init: true                 # 让 PID 1 正确处理信号
```

4. **在 `docker-compose.yml` 补充 cap_drop**（纵深防御）：

```yaml
    cap_drop:
      - ALL
    # api 不需要任何 Linux capability（非 root 运行）
```

5. **验证**：

```bash
# 重建容器
docker compose up -d --build api

# 确认运行用户
docker exec notes-api id
# 应输出: uid=1000(appuser) gid=1000(appuser)

# 确认 API 正常
curl http://localhost/api/health

# 确认 Wiki 发布仍可用（如已配置 WIKI_OWNER）
# 登录笔记应用 → 发布到 Wiki → 检查 entries/ 目录文件属主
ls -la /home/ubuntu/wiki/entries/
# 应看到文件属主为 1000:1000（ubuntu 用户可读写）
```

**注意事项**：
- 如果宿主机 wiki 目录属主不是 1000:1000，需要 `chown -R 1000:1000 /home/ubuntu/wiki/entries`
- SQLite 数据库 `/data/notes.db` 需确保属主为 1000（重建卷时 Docker 会自动处理，但已有数据需手动 `chown`）
- Caddy 需绑定 80/443 端口，非 root 需要 `NET_BIND_SERVICE` capability，Caddy 镜像默认已处理

---

### P0-B. 监控与告警体系

**目标**：关键指标异常 5 分钟内告警，故障发现先于用户投诉。

**整体架构**：

```
api (/metrics)  ──┐
caddy (admin)   ──┤──→  Prometheus  ──→  Grafana (可视化)
node-exporter   ──┤         │
                   │         ▼
                   └→  Alertmanager  ──→  邮件/Bark/Server酱
```

**操作步骤**：

#### 步骤 1：后端暴露 Prometheus 指标

1. 在 `apps/api/pyproject.toml` 添加依赖：

```toml
dependencies = [
    # ... 已有依赖 ...
    "prometheus-fastapi-instrumentator>=6.1.0",
]
```

2. 在 `apps/api/app/main.py` 注册指标端点：

```python
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(title="笔记网站 API", version="0.1.0", lifespan=lifespan)

# 暴露 /metrics 给 Prometheus 抓取
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/api/health"],  # 健康检查不计入指标
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

3. 在 `deploy/Caddyfile` 暴露 Caddy 自身指标（admin API 默认 :2019）：

```caddyfile
# 在全局块加 admin 监听（如已禁用需重新开启）
{
    email admin@coderwenn.cloud
    admin off  # 如果是 off，Caddy 不暴露 admin API；改去掉这行或设为 on
}
```

> Caddy v2 默认在 `:2019` 暴露 admin API，Prometheus 可直接抓取 `http://caddy:2019/metrics`。

#### 步骤 2：创建监控编排文件

创建 `deploy/monitoring/docker-compose.monitoring.yml`：

```yaml
# 监控栈：Prometheus + Grafana + Alertmanager + Node Exporter
# 用法：docker compose -f docker-compose.yml -f deploy/monitoring/docker-compose.monitoring.yml up -d
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: notes-prometheus
    restart: unless-stopped
    volumes:
      - ./deploy/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=30d"
    networks:
      - default
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  alertmanager:
    image: prom/alertmanager:latest
    container_name: notes-alertmanager
    restart: unless-stopped
    volumes:
      - ./deploy/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    networks:
      - default

  grafana:
    image: grafana/grafana:latest
    container_name: notes-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"           # 映射到宿主机 3001，避免与 open-webui 冲突
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:?请设置 GRAFANA_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - default

  node-exporter:
    image: prom/node-exporter:latest
    container_name: notes-node-exporter
    restart: unless-stopped
    pid: host                  # 访问宿主机进程信息
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - "--path.procfs=/host/proc"
      - "--path.sysfs=/host/sys"
      - "--path.rootfs=/rootfs"
    networks:
      - default

volumes:
  prometheus-data:
  grafana-data:
```

#### 步骤 3：创建 Prometheus 配置

创建 `deploy/monitoring/prometheus.yml`：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

rule_files:
  - "alert_rules.yml"

scrape_configs:
  # 后端 API 指标
  - job_name: "notes-api"
    static_configs:
      - targets: ["api:8000"]
    metrics_path: /metrics
    scrape_interval: 10s

  # Caddy 指标（admin API）
  - job_name: "caddy"
    static_configs:
      - targets: ["caddy:2019"]
    scrape_interval: 10s

  # 宿主机指标
  - job_name: "node"
    static_configs:
      - targets: ["node-exporter:9100"]
    scrape_interval: 15s
```

#### 步骤 4：创建告警规则

创建 `deploy/monitoring/alert_rules.yml`：

```yaml
groups:
  - name: notes-app.rules
    rules:
      # API 宕机
      - alert: ApiDown
        expr: up{job="notes-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "笔记 API 宕机"
          description: "api:8000 已 1 分钟不可达"

      # 高错误率
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{job="notes-api",status=~"5.."}[5m])
          / rate(http_requests_total{job="notes-api"}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API 错误率 > 10%"
          description: "过去 5 分钟 5xx 错误率超过 10%"

      # 宿主机磁盘 > 85%
      - alert: DiskSpaceHigh
        expr: |
          (node_filesystem_avail_bytes{mountpoint="/"}
          / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "磁盘空间不足"
          description: "根分区剩余空间 < 15%"

      # 宿主机内存 > 90%
      - alert: MemoryHigh
        expr: |
          (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "内存使用率高"
          description: "宿主机内存使用 > 90%"
```

#### 步骤 5：创建 Alertmanager 配置

创建 `deploy/monitoring/alertmanager.yml`（以 Bark 推送为例）：

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ["alertname"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: "bark"

receivers:
  - name: "bark"
    webhook_configs:
      # 替换为你的 Bark key
      - url: "https://api.day.app/你的BARK_KEY/笔记服务告警"
        send_resolved: true
```

#### 步骤 6：启动与验证

```bash
# 在 .env 添加 Grafana 密码
echo "GRAFANA_PASSWORD=你的强密码" >> .env

# 启动监控栈（与主服务一起）
docker compose -f docker-compose.yml \
  -f deploy/monitoring/docker-compose.monitoring.yml up -d

# 验证 Prometheus 已抓取到目标
# 浏览器打开 http://服务器IP:3001 (Grafana, admin/你设的密码)
# → Connections → Data Sources → 添加 Prometheus (http://prometheus:9090)
# → Targets 页面应看到 notes-api / caddy / node 三个 job 状态为 UP
```

---

### P0-C. 镜像仓库 + 版本化部署

**目标**：每次构建产出带版本 tag 的镜像，部署从仓库拉取而非服务器现场构建，支持秒级回滚。

**操作步骤**：

1. **在 GitHub 创建 Personal Access Token**（Settings → Developer settings → PAT → 勾选 `write:packages`）。

2. **修改 `.github/workflows/ci.yml`**，在 `build-web` job 之后加一个 `build-and-push` job：

```yaml
  build-and-push:
    name: Build & Push Images
    needs: [test-api, test-web, build-web]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'   # 仅 main 分支推送镜像
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # 自动提供，无需额外配置

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: apps/api
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/notes-api:latest
            ghcr.io/${{ github.repository_owner }}/notes-api:${{ github.sha }}

      - name: Build and push Caddy image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: deploy/Dockerfile.caddy
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/notes-caddy:latest
            ghcr.io/${{ github.repository_owner }}/notes-caddy:${{ github.sha }}
```

3. **创建生产用 compose 文件** `docker-compose.prod.yml`（覆盖 build 为 image）：

```yaml
# 生产部署覆盖文件：从镜像仓库拉取，不再现场构建
# 用法：docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
services:
  api:
    image: ghcr.io/你的用户名/notes-api:${IMAGE_TAG:-latest}
    build: !reset null     # 禁用 build

  caddy:
    image: ghcr.io/你的用户名/notes-caddy:${IMAGE_TAG:-latest}
    build: !reset null
```

4. **服务器上登录 GHCR 并部署**：

```bash
# 一次性：登录镜像仓库
echo "你的GHCR_TOKEN" | docker login ghcr.io -u 你的用户名 --password-stdin

# 部署（指定版本）
IMAGE_TAG=abc1234 docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

5. **回滚**（切换到旧版本 tag 即可，秒级）：

```bash
# 查看可用版本（在 GitHub Packages 页面查看 sha tag）
# 回滚到指定版本
IMAGE_TAG=旧版本sha docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

### P0-D. 自动化回滚脚本

**目标**：部署失败后一键回滚到上一可用版本。

**操作步骤**：

创建 `deploy/rollback.sh`：

```bash
#!/usr/bin/env bash
# 回滚到上一版本：读取版本记录，切换到倒数第二个 tag
set -euo pipefail

VERSION_FILE="./deploy/.current-version"
ROLLBACK_FILE="./deploy/.rollback-version"

if [ ! -f "$VERSION_FILE" ]; then
  echo "未找到版本记录 $VERSION_FILE，无法回滚"
  exit 1
fi

CURRENT=$(cat "$VERSION_FILE")
echo "当前版本: $CURRENT"

# 从版本历史中取上一版
HISTORY_FILE="./deploy/.version-history"
if [ ! -f "$HISTORY_FILE" ]; then
  echo "未找到版本历史 $HISTORY_FILE，无法回滚"
  exit 1
fi

PREV=$(tail -2 "$HISTORY_FILE" | head -1)
if [ -z "$PREV" ] || [ "$PREV" = "$CURRENT" ]; then
  echo "没有更早的版本可回滚"
  exit 1
fi

echo "回滚到: $PREV"
IMAGE_TAG=$PREV docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
echo "$PREV" > "$VERSION_FILE"
echo "回滚完成 ✓"
```

配套的部署脚本 `deploy/deploy.sh`（记录版本）：

```bash
#!/usr/bin/env bash
# 部署脚本：拉取指定版本镜像并部署，记录版本历史
set -euo pipefail

TAG="${1:-latest}"
HISTORY_FILE="./deploy/.version-history"
VERSION_FILE="./deploy/.current-version"

echo "部署版本: $TAG"
IMAGE_TAG=$TAG docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 健康检查
sleep 10
if curl -sf http://localhost/api/health > /dev/null; then
  echo "健康检查通过 ✓"
  echo "$TAG" > "$VERSION_FILE"
  echo "$TAG" >> "$HISTORY_FILE"
  # 只保留最近 10 个版本
  tail -10 "$HISTORY_FILE" > "$HISTORY_FILE.tmp" && mv "$HISTORY_FILE.tmp" "$HISTORY_FILE"
else
  echo "⚠ 健康检查失败！执行回滚..."
  ./deploy/rollback.sh
fi
```

```bash
chmod +x deploy/rollback.sh deploy/deploy.sh
```

---

## P1 — 中等，建议近期推进

### P1-A. 引入 Alembic 数据库迁移

**目标**：schema 变更可追溯、可回滚，替代 `init_db()` 的 `create_all()`。

**操作步骤**：

1. **安装 Alembic**：

```bash
cd apps/api
uv add alembic
```

2. **初始化 Alembic**：

```bash
uv run alembic init alembic
```

3. **配置 `apps/api/alembic/env.py`**，让它读取项目的 SQLAlchemy 配置：

```python
# alembic/env.py 关键修改
from app.database import Base, engine
from app.config import settings
import app.models  # 注册所有模型

# 指向项目的 engine
config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata
```

4. **生成初始迁移**（基于现有模型）：

```bash
uv run alembic revision --autogenerate -m "initial schema"
```

5. **修改 `app/main.py` 的 lifespan**，生产环境用迁移替代 create_all：

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 生产用 Alembic 迁移；开发保留 create_all 快速建表
    if settings.database_url.startswith("sqlite:///./"):
        # 开发环境
        init_db()
    else:
        # 生产环境：执行迁移
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
    yield
```

6. **Dockerfile 中加入迁移**（部署时自动执行）：

```dockerfile
# apps/api/Dockerfile，在 CMD 之前
COPY alembic ./alembic
COPY alembic.ini ./
# 启动时先迁移再运行（CMD 中串联）
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
```

7. **验证**：

```bash
# 本地测试迁移
uv run alembic upgrade head    # 建表
uv run alembic current         # 查看当前版本
uv run alembic history         # 查看迁移历史

# 以后改模型后：
uv run alembic revision --autogenerate -m "add xxx column"
uv run alembic upgrade head
```

---

### P1-B. 零停机部署（蓝绿）

**目标**：发布期间用户无感知。

**原理**：同时运行 api-blue 和 api-green 两个实例，Caddy 指向当前活跃的实例。部署新版本到非活跃实例，健康检查通过后切换流量。

**操作步骤**：

1. **修改 `docker-compose.yml`**，把 api 拆为 blue/green：

```yaml
services:
  api-blue:
    build: { context: ./apps/api }
    # ... 原有 api 的所有配置（environment/volumes/healthcheck 等）...
    container_name: notes-api-blue

  api-green:
    build: { context: ./apps/api }
    # ... 与 blue 完全相同 ...
    container_name: notes-api-green

  caddy:
    depends_on:
      api-blue:
        condition: service_healthy
      # green 不加 depends_on（按需启动）
```

2. **修改 `deploy/Caddyfile`**，用环境变量控制上游：

```caddyfile
coderwenn.cloud, www.coderwenn.cloud {
    tls /certs/coderwenn.cloud.crt /certs/coderwenn.cloud.key

    handle /api/* {
        reverse_proxy {$API_ACTIVE:api-blue}:8000
    }
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
```

3. **创建蓝绿部署脚本** `deploy/blue-green.sh`：

```bash
#!/usr/bin/env bash
# 蓝绿部署：构建非活跃实例 → 健康检查 → 切换流量 → 停旧实例
set -euo pipeaf

ACTIVE=$(docker exec notes-caddy printenv API_ACTIVE 2>/dev/null || echo "api-blue")
if [ "$ACTIVE" = "api-blue" ]; then
  STANDBY="api-green"
else
  STANDB="api-blue"
fi

echo "当前活跃: $ACTIVE, 部署到: $STANDBY"

# 1. 启动 standby 实例（新版本）
docker compose up -d --build --no-deps $STANDBY

# 2. 等待健康检查通过
echo "等待 $STANDBY 健康检查..."
for i in $(seq 1 30); do
  if docker inspect --format='{{.State.Health.Status}}' notes-api-$STANDBY 2>/dev/null | grep -q healthy; then
    echo "$STANDBY 健康检查通过 ✓"
    break
  fi
  sleep 2
  [ $i -eq 30 ] && echo "⚠ 健康检查超时！" && exit 1
done

# 3. 切换 Caddy 上游
docker exec notes-caddy printenv API_ACTIVE  # 当前值
docker compose stop caddy
API_ACTIVE=$STANDBY docker compose up -d caddy

# 4. 停止旧实例
docker compose stop $ACTIVE
echo "蓝绿部署完成 ✓ 活跃实例: $STANDBY"
```

4. **验证**：

```bash
chmod +x deploy/blue-green.sh
./deploy/blue-green.sh
# 部署期间用另一个终端持续 curl，应无中断
while true; do curl -sf http://localhost/api/health && echo " ok" || echo " FAIL"; sleep 1; done
```

---

### P1-C. 证书管理容器化

**目标**：消除宿主机 acme.sh 依赖，证书续期全在 Docker 内完成。

**操作步骤**：

1. **创建 `deploy/certbot/Dockerfile.certbot`**：

```dockerfile
FROM certbot/certbot:latest
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

2. **创建 `deploy/certbot/entrypoint.sh`**：

```bash
#!/bin/sh
# 续期循环：每 12 小时检查一次
while true; do
  certbot renew --non-interactive \
    --dns-dnspod-credentials /secrets/dnspod.ini \
    --deploy-hook "cp -f /etc/letsencrypt/live/coderwenn.cloud/* /certs/ && chmod 644 /certs/*"
  sleep 43200
done
```

3. **在 `docker-compose.yml` 添加 certbot 服务**：

```yaml
  certbot:
    image: certbot/certbot:latest
    container_name: notes-certbot
    restart: unless-stopped
    entrypoint: ["sh", "-c", "while true; do certbot renew --non-interactive --dns-dnspod --dns-dnspod-credentials /secrets/dnspod.ini --deploy-hook 'cp -f /etc/letsencrypt/live/coderwenn.cloud/* /certs/ && chmod 644 /certs/*' && sleep 12h; done"]
    environment:
      DP_Id: ${DP_Id}
      DP_Key: ${DP_Key}
    volumes:
      - ./deploy/certs:/certs
      - certbot-data:/etc/letsencrypt
    # DNSPod 凭证通过 secrets 注入
    secrets:
      - dnspod-credentials
```

4. **创建 DNSPod 凭证文件** `deploy/certbot/dnspod.ini`：

```ini
dns_dnspod_api_id = 你的ID
dns_dnspod_api_token = 你的Token
```

```bash
chmod 600 deploy/certbot/dnspod.ini
echo "deploy/certbot/dnspod.ini" >> .gitignore
```

5. **移除宿主机 acme.sh cron**：

```bash
crontab -l | grep -v acme.sh | crontab -
# 卸载 acme.sh（可选）
~/.acme.sh/acme.sh --uninstall
```

**替代方案（更简单）**：如果域名已备案且 80 端口可达，直接启用 Caddy 内置 ACME：

```caddyfile
coderwenn.cloud, www.coderwenn.cloud {
    # 删掉 tls /certs/... 这行，Caddy 自动申请管理证书
    handle /api/* {
        reverse_proxy api:8000
    }
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
```

Caddy 内置 ACME，证书自动续期，无需任何外部工具。**这是最简单的方案，推荐优先尝试。**

---

### P1-D. 镜像 digest 固定

**目标**：消除可变 tag 带来的构建不可复现风险。

**操作步骤**：

1. **查询镜像 digest**：

```bash
docker inspect --format='{{index .RepoDigests 0}}' ghcr.nju.edu.cn/open-webui/open-webui:main
# 输出类似: ghcr.nju.edu.cn/open-webui/open-webui@sha256:abc123...
```

2. **修改 `docker-compose.yml`**，用 digest 替代 tag：

```yaml
  open-webui:
    image: ghcr.nju.edu.cn/open-webui/open-webui:main@sha256:abc123def456...
```

3. **定期更新**：手动或在 CI 中用 Renovate 自动提 PR 升级。

---

### P1-E. 依赖漏洞扫描

**目标**：自动发现 Python/npm 依赖的已知 CVE。

**操作步骤**：

在 `.github/workflows/ci.yml` 添加扫描 job：

```yaml
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Python 依赖扫描
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - name: Install pip-audit
        run: pip install pip-audit
      - name: Scan Python dependencies
        working-directory: apps/api
        run: |
          uv export --frozen --no-dev --no-emit-project --no-hashes -o requirements.txt
          pip-audit -r requirements.txt --ignore-vuln GHSA-xxxx  # 如需忽略特定漏洞

      # npm 依赖扫描
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install pnpm
        run: npm install -g pnpm@10
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Scan npm dependencies
        run: pnpm audit --audit-level high
```

---

### P1-F. 结构化日志

**目标**：日志 JSON 化，便于检索和关联。

**操作步骤**：

1. **安装 `structlog`**：

```bash
cd apps/api
uv add "structlog>=24.0"
```

2. **创建 `apps/api/app/logging_config.py`**：

```python
import structlog
import logging

def setup_logging():
    """配置结构化日志：JSON 格式，便于聚合检索"""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),   # JSON 输出
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
    )
```

3. **在 `main.py` 启动时调用**：

```python
from app.logging_config import setup_logging

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    log = structlog.get_logger()
    log.info("app_starting", version="0.1.0")
    init_db()
    yield
    log.info("app_stopping")
```

4. **在业务代码中使用**：

```python
import structlog
log = structlog.get_logger()

# 替代 print / logging
log.info("note_created", note_id=note.id, user_id=user.id)
log.warning("login_failed", username=payload.username, ip=request.client.host)
log.error("db_error", error=str(e))
```

日志输出示例（单行 JSON）：
```json
{"event":"note_created","note_id":42,"user_id":1,"level":"info","timestamp":"2026-07-22T22:00:00Z"}
```

---

### P1-G. 预发布环境

**目标**：变更先在 staging 验证再上生产。

**轻量方案**（同机 staging，用 compose profiles）：

1. **创建 `docker-compose.staging.yml`**：

```yaml
# 预发布环境：不同端口 + 独立数据卷
services:
  api-staging:
    build: { context: ./apps/api }
    container_name: notes-api-staging
    ports:
      - "8001:8000"            # 直连访问（测试用）
    environment:
      DATABASE_URL: sqlite:////data/notes-staging.db
      SECRET_KEY: ${STAGING_SECRET_KEY:?设置 STAGING_SECRET_KEY}
      # ... 其他环境变量与生产一致 ...
    volumes:
      - notes-data-staging:/data
    profiles: ["staging"]

  caddy-staging:
    build:
      context: .
      dockerfile: deploy/Dockerfile.caddy
    container_name: notes-caddy-staging
    ports:
      - "8081:80"
    profiles: ["staging"]
    depends_on:
      api-staging:
        condition: service_healthy

volumes:
  notes-data-staging:
```

2. **使用**：

```bash
# 启动 staging
docker compose -f docker-compose.yml -f docker-compose.staging.yml --profile staging up -d

# 访问 http://服务器IP:8081 测试
# 验证通过后，再部署到生产
```

---

## P2 — 增强加固（后续按需推进）

### P2-A. Redis 限流器（多 worker 一致）

当前 `/api/summarize` 和鉴权限流都是内存级，多 worker 下各自计数。如果未来 uvicorn 跑多 worker：

```bash
cd apps/api
uv add redis
```

```python
# app/services/rate_limiter_redis.py
import redis, time

class RedisRateLimiter:
    def __init__(self, redis_url: str, max_calls: int, window: float):
        self.r = redis.from_url(redis_url)
        self.max_calls = max_calls
        self.window = window

    def allow(self, key: str) -> bool:
        now = time.time()
        pipe = self.r.pipeline()
        pipe.zremrangebyscore(key, 0, now - self.window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, int(self.window))
        _, _, count, _ = pipe.execute()
        return count <= self.max_calls
```

### P2-B. JWT 吊销机制

```python
# 加 jti + Redis 黑名单
import uuid

def _create_token(subject: str, expires_delta: timedelta, token_type: str) -> str:
    payload = {
        "sub": subject,
        "type": token_type,
        "jti": str(uuid.uuid4()),    # 唯一 ID
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)

# 吊销：把 jti 加入 Redis 黑名单（TTL = token 剩余有效期）
```

### P2-C. 网络分段

```yaml
# docker-compose.yml
networks:
  frontend:     # caddy 独占
  backend:      # api + open-webui + db

services:
  caddy:
    networks: [frontend, backend]
  api:
    networks: [backend]    # 不在 frontend，外部无法直连
  open-webui:
    networks: [backend]
```

### P2-D. 配置启动校验

```python
# config.py
from pydantic import field_validator

class Settings(BaseSettings):
    # ...

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v):
        if v in ("dev-secret-change-me", "change-me-to-a-random-32+-byte-string"):
            import sys
            print("⚠ 警告：使用默认 SECRET_KEY，生产环境不安全！", file=sys.stderr)
        return v
```

---

## 实施路线图

| 阶段 | 项目 | 预计工作量 | 依赖 |
|------|------|-----------|------|
| **第 1 周** | P0-A 容器非 root | 1-2 小时 | 无 |
| **第 1 周** | P0-D 自动化回滚脚本 | 1 小时 | P0-C 镜像仓库 |
| **第 1-2 周** | P0-C 镜像仓库 + 版本化 | 2-3 小时 | GitHub PAT |
| **第 2 周** | P0-B 监控告警 | 3-5 小时 | 无 |
| **第 3 周** | P1-A Alembic 迁移 | 2 小时 | 无 |
| **第 3 周** | P1-C 证书容器化 | 1-2 小时 | 无（或用 Caddy 内置 ACME 更简单） |
| **第 3-4 周** | P1-B 零停机部署 | 3-4 小时 | P0-C 镜像仓库 |
| **第 4 周** | P1-D 镜像 digest | 30 分钟 | 无 |
| **第 4 周** | P1-E 依赖扫描 | 1 小时 | CI 已就绪 |
| **第 4 周** | P1-F 结构化日志 | 2 小时 | 无 |
| **后续** | P1-G 预发布环境 | 2 小时 | 无 |
| **后续** | P2 各项 | 按需 | 无 |

> 建议从 **P0-A（非 root）** 和 **P1-C（证书容器化，或直接用 Caddy 内置 ACME）** 开始——这两项工作量小、风险低、收益明显。监控告警（P0-B）虽然工作量大，但对可靠性提升最显著，建议作为第二优先级。

---

**文档版本**：v1.0
**生成日期**：2026-07-22
