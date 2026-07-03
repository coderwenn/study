# 部署指南（Linux VPS + Docker）

架构：**Caddy**（静态前端 + `/api` 反代 + HTTPS）+ **uvicorn**（FastAPI 后端）+ **SQLite**（挂卷持久化）+ **Open WebUI**（AI 聊天界面）。

```
                    ┌─────────────┐
  :80/:443 →        │   caddy     │  ──/api/*──→  api:8000 (uvicorn)
                    │ (前端静态)   │              └→ /data/notes.db (卷)
                    └──────┬──────┘
                           └──chat.coderwenn.cloud──→ open-webui:8080
                                                          └→ Hermes API (宿主机:8642)
```

## 1. 服务器准备（一次性）

在 VPS 上安装 Docker 与 Docker Compose 插件（以 Debian/Ubuntu 为例）：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登录生效
docker --version && docker compose version
```

开放防火墙的 80（及将来 443）端口：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # 升级 HTTPS 前放开
sudo ufw allow 22/tcp    # 别忘了 SSH
```

## 2. 拉代码 + 配置密钥

```bash
git clone <你的仓库地址> notes-app && cd notes-app

# 生成并写入 JWT 密钥（务必改！）
cp .env.example .env
sed -i "s|change-me-to-a-random-32+-byte-string|$(openssl rand -hex 32)|" .env

# 设置 Hermes API Key（用于 Open WebUI 连接 AI 后端）
echo "HERMES_API_KEY=你的API密钥" >> .env

cat .env   # 确认 SECRET_KEY 和 HERMES_API_KEY 已设置
```

## 3. 构建并启动

```bash
docker compose up -d --build
```

首次会构建两个镜像（api、caddy），随后后台启动。查看状态：

```bash
docker compose ps
docker compose logs -f api      # 看后端日志，应出现 Uvicorn running
```

## 4. 验证

```bash
# 本机健康检查
curl http://localhost/api/health        # → {"status":"ok"}
curl -I http://localhost/               # 前端首页 200
```

## 5. 用域名访问（HTTP）

在域名 DNS 添加 **A 记录**：`notes.example.com` → 服务器公网 IP。
等解析生效后，浏览器打开 `http://notes.example.com` 即可注册使用。

> 现在是 HTTP。下面一步可一键升级 HTTPS。

## 6. HTTPS 证书（acme.sh DNS-01）

国内服务器域名需 ICP 备案，且 HTTP-01 / TLS-ALPN-01 验证会被运营商拦截。
使用 **DNS-01** 方式通过 DNSPod API 自动验证，绕过拦截。

```bash
# 1. 安装 acme.sh
curl https://get.acme.sh | sh

# 2. 设置 DNSPod API Token（在 DNSPod 控制台创建）
export DP_Id=你的ID
export DP_Key=你的Token

# 3. 申请通配符证书（EC-256）
~/.acme.sh/acme.sh --issue --dns dns_dp \
  -d coderwenn.cloud -d '*.coderwenn.cloud' --keylength ec-256

# 4. 安装证书到 deploy/certs/ 并设置自动续期
mkdir -p deploy/certs
~/.acme.sh/acme.sh --install-cert -d coderwenn.cloud --ecc \
  --key-file deploy/certs/coderwenn.cloud.key \
  --fullchain-file deploy/certs/coderwenn.cloud.crt \
  --reloadcmd "docker compose restart caddy"
```

> 证书有效期为 90 天，acme.sh 会通过 cron 自动续期。
> `deploy/certs/` 已在 `.gitignore`，证书文件不会提交到仓库。

## 7. 数据备份（SQLite）

数据库在 docker 卷 `notes-data`，文件为 `/data/notes.db`。定期备份：

```bash
# 导出到宿主机当前目录
docker compose exec api cat /data/notes.db > notes-backup-$(date +%F).db
```

恢复：把备份文件覆盖回卷内 `/data/notes.db`（停服后操作）。

## 8. 更新版本

```bash
git pull
docker compose up -d --build      # 重建镜像并滚动重启
```

## 8.5 发布笔记到 LLM Wiki（可选）

若服务器上部署了 Hermes 的 llm-wiki，可把笔记一键发布为 wiki「来源」：

1. 确保宿主机目录存在且属主正确（Hermes 以该用户读写）：
   ```bash
   mkdir -p /home/ubuntu/wiki/entries
   id -u ubuntu   # 记下 uid（通常 1000）
   ```
2. 在根 `.env` 填：
   ```bash
   WIKI_OWNER=你的笔记应用登录名
   WIKI_UID=1000
   WIKI_GID=1000
   ```
   （`WIKI_ENTRIES_PATH` 由 compose 固定为容器内 `/wiki/entries`，宿主机固定挂 `/home/ubuntu/wiki/entries`，无需改。）
3. `docker compose up -d --build api` 重建后端。
4. 以 `WIKI_OWNER` 用户登录笔记应用，打开任意笔记点「发布到 Wiki」，应提示 `已发布：xxx.md`。

> 发布是「来源投递」：只写 `entries/`，不动 `index.md`/`log.md`/`SCHEMA.md`；交叉引用与综合成页交给 Hermes。详见 ADR-001。

## 9. 常用运维命令

```bash
docker compose ps                 # 查看服务状态
docker compose logs -f            # 跟踪所有日志
docker compose restart api        # 只重启后端
docker compose down               # 停止（卷数据保留）
docker compose down -v            # 停止并删除数据卷（⚠️ 清空数据库）
```

## 安全提示

- `.env`（含 SECRET_KEY）已在 `.gitignore`，**不要**提交。
- SQLite 单文件适合个人量级；若开放多用户或并发增大，建议迁 PostgreSQL（后端改连接串即可）。
- 生产建议给后端容器加非 root 用户、限制卷权限等加固（个人用可后续再做）。
