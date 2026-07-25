#!/usr/bin/env bash
# SQLite 自动备份脚本
# 用法：
#   手动执行：  ./deploy/backup.sh
#   定时执行：  crontab -e → 加一行（每天凌晨 3 点备份）
#     0 3 * * * cd /path/to/notes-app && ./deploy/backup.sh >> /var/log/notes-backup.log 2>&1
#
# 原理：用 Python sqlite3.backup() 做在线一致性备份（正确处理 WAL），
#       再 docker cp 到宿主机，按日期命名并保留最近 N 份。
set -euo pipefail

# ── 配置 ──
BACKUP_DIR="${BACKUP_DIR:-./deploy/backups}"   # 备份存放目录
RETAIN_DAYS="${RETAIN_DAYS:-30}"                # 保留最近 N 天
CONTAINER_NAME="${CONTAINER_NAME:-notes-api}"  # API 容器名（见 docker-compose.yml）
DB_PATH="/data/notes.db"                        # 容器内数据库路径
TMP_BAK="/tmp/notes-backup.db"                  # 容器内临时备份路径

# ── 前置检查 ──
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[$(date '+%F %T')] ERROR: 容器 ${CONTAINER_NAME} 未运行，跳过备份"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/notes-${TIMESTAMP}.db"

echo "[$(date '+%F %T')] 开始备份 → ${BACKUP_FILE}"

# ── 在容器内做一致性备份（Python sqlite3.backup 处理 WAL）──
docker exec "${CONTAINER_NAME}" python -c "
import sqlite3, sys
src = sqlite3.connect('${DB_PATH}')
dst = sqlite3.connect('${TMP_BAK}')
try:
    src.backup(dst)
except Exception as e:
    print(f'备份失败: {e}', file=sys.stderr)
    sys.exit(1)
finally:
    dst.close()
    src.close()
print('容器内备份完成')
"

# ── 从容器拷贝到宿主机 ──
docker cp "${CONTAINER_NAME}:${TMP_BAK}" "${BACKUP_FILE}"

# 清理容器内临时文件
docker exec "${CONTAINER_NAME}" rm -f "${TMP_BAK}" 2>/dev/null || true

# ── 校验备份完整性 ──
echo "[$(date '+%F %T')] 校验备份完整性..."
docker run --rm -v "${BACKUP_FILE}:/check.db:ro" python:3.13-slim python -c "
import sqlite3
con = sqlite3.connect('/check.db')
tables = con.execute(\"SELECT count(*) FROM sqlite_master WHERE type='table'\").fetchone()[0]
print(f'备份校验通过：{tables} 张表')
con.close()
"

# ── 清理过期备份 ──
echo "[$(date '+%F %T')] 清理 ${RETAIN_DAYS} 天前的旧备份..."
find "$BACKUP_DIR" -name "notes-*.db" -mtime +${RETAIN_DAYS} -delete 2>/dev/null || true

# 统计
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "notes-*.db" | wc -l | tr -d ' ')
echo "[$(date '+%F %T')] 备份完成 ✓"
echo "  文件：${BACKUP_FILE}"
echo "  大小：${BACKUP_SIZE}"
echo "  保留：${BACKUP_COUNT} 份（策略 ${RETAIN_DAYS} 天）"
