# 部署指南（Linux VPS + Docker）

架构：**Caddy**（静态前端 + `/api` 反代）+ **uvicorn**（FastAPI 后端）+ **SQLite**（挂卷持久化）。

```
        ┌─────────────┐
  :80 → │   caddy     │  ──/api/*──→  api:8000 (uvicorn)
        │ (前端静态)   │              └→ /data/notes.db (卷)
        └─────────────┘
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
cat .env   # 确认 SECRET_KEY 已替换
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

## 6. 升级到 HTTPS（Caddy 自动证书）

Caddy 的优势：把 `:80` 改成域名，它自动向 Let's Encrypt 申请并续期证书。

1. 编辑 `deploy/Caddyfile`，把第一行 `:80 {` 改成：
   ```
   notes.example.com {
   ```
2. 编辑 `docker-compose.yml`，放开 caddy 的 443 端口：
   ```yaml
   ports:
     - "80:80"
     - "443:443"
   ```
3. 重建 caddy：
   ```bash
   docker compose up -d --build caddy
   ```
片刻后 `https://notes.example.com` 即生效（Caddy 自动把 80 跳转到 443）。

> 前提：域名已正确解析到本机，且 80/443 端口可被公网访问（Let's Encrypt 会回连校验）。

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
