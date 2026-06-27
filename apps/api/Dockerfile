# 后端 API 镜像：用 uv 安装依赖并运行 uvicorn
FROM python:3.13-slim

# 从官方镜像装入 uv（比 pip 装 uv 更快更稳）
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 先拷依赖清单，利用 Docker 层缓存（改代码不重装依赖）
COPY pyproject.toml uv.lock ./
# 只装生产依赖（跳过 dev 组：pytest/httpx）
RUN uv sync --frozen --no-dev

# 拷贝源码
COPY app ./app

# SQLite 数据文件存放目录（由 docker-compose 挂卷持久化）
RUN mkdir -p /data

# 运行时由 docker-compose / .env 覆盖 SECRET_KEY 等敏感配置
ENV DATABASE_URL=sqlite:////data/notes.db

EXPOSE 8000

# --proxy-headers：信任前方 Caddy 转发的 X-Forwarded-* 头
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
