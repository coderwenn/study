# 后端 API 镜像：uv 导出锁定版本 + pip 安装 + 运行 uvicorn
FROM python:3.13-slim

# 国内 PyPI 镜像加速 pip（海外部署可删本行或换回 pypi.org）
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# uv 仅用于导出锁定的依赖清单（不参与安装）
RUN pip install --no-cache-dir uv

WORKDIR /app

# 先拷依赖清单，利用 Docker 层缓存（改代码不重装依赖）
COPY pyproject.toml uv.lock ./

# 导出锁定的生产依赖，用 pip 从镜像源安装到系统环境。
# 说明：uv sync --frozen 会沿用 uv.lock 记录的官方下载地址，镜像源不生效；
# 改用「uv 导出 + pip 安装」，pip 走 PIP_INDEX_URL 镜像源，速度快且稳定。
RUN uv export --frozen --no-dev --no-emit-project --no-hashes -o requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

# 拷贝源码
COPY app ./app

# 运行时由 docker-compose / .env 覆盖 DATABASE_URL 等配置
# 默认指向 PostgreSQL（与 docker-compose 的 db 服务配合）
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/notes

EXPOSE 8000

# 依赖已装入系统环境，直接运行 uvicorn
# --proxy-headers：信任前方 Caddy 转发的 X-Forwarded-* 头
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
