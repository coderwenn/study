"""
SQLite → PostgreSQL 一次性迁移脚本。

用法（本地开发）：
  cd apps/api && uv run python scripts/migrate_sqlite_to_pg.py \
      --sqlite ./notes.db \
      --pg "postgresql://postgres:password@localhost:5432/notes"

用法（生产，在 docker-compose 网络内跑）：
  docker compose run --rm \
      -v notes-data:/data:ro \
      api uv run python scripts/migrate_sqlite_to_pg.py \
          --sqlite /data/notes.db \
          --pg "postgresql://postgres:password@postgres:5432/notes"

说明：
  1. 从源 SQLite 读全部业务数据（users / tags / notes / note_tags）
  2. 在目标 PG 建表（跑 init_db，含 pg_trgm + GIN 索引）
  3. 按依赖顺序写入 PG（users → tags → notes → note_tags）
  4. 将 username="温千禧" 的用户提升为超级管理员（role=admin）
  5. 逐表对比行数，验证迁移完整性
"""
import argparse
import sys

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

# 确保能 import app 包（脚本从 apps/api 目录运行时）
sys.path.insert(0, ".")

from app.database import Base, init_db  # noqa: E402
from app.models.note import Note, note_tags  # noqa: E402
from app.models.tag import Tag  # noqa: E402
from app.models.user import User  # noqa: E402
import app.models  # noqa: E402, F401  注册所有模型


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SQLite → PostgreSQL 迁移脚本")
    parser.add_argument(
        "--sqlite",
        required=True,
        help="源 SQLite 文件路径（如 ./notes.db 或 /data/notes.db）",
    )
    parser.add_argument(
        "--pg",
        required=True,
        help='目标 PostgreSQL 连接串（如 "postgresql://user:pwd@host:5432/db"）',
    )
    return parser.parse_args()


def copy_table(src_session: Session, dst_session: Session, model_cls) -> int:
    """
    从源 DB 读出 model_cls 的全部行，写入目标 DB。
    提取列数据新建对象，避免 ORM 对象跨 session 冲突。
    返回迁移行数。
    """
    count = 0
    for row in src_session.scalars(select(model_cls)):
        # 提取已加载的列数据（排除 SQLAlchemy 内部状态）
        data = {k: v for k, v in row.__dict__.items() if not k.startswith("_sa_")}
        new_obj = model_cls(**data)
        dst_session.add(new_obj)
        count += 1
    dst_session.flush()
    return count


def copy_note_tags(src_session: Session, dst_session: Session) -> int:
    """note_tags 是关联表（无 ORM 类），手动读写"""
    rows = src_session.execute(
        text("SELECT note_id, tag_id FROM note_tags")
    ).fetchall()
    for note_id, tag_id in rows:
        dst_session.execute(
            note_tags.insert().values(note_id=note_id, tag_id=tag_id)
        )
    return len(rows)


def count_rows(session: Session, table_name: str) -> int:
    """通用行数统计"""
    return session.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()


def main():
    args = parse_args()

    # ── 1. 创建源（SQLite，只读）与目标（PG）引擎 ──
    src_engine = create_engine(f"sqlite:///{args.sqlite}")
    dst_engine = create_engine(args.pg)

    SrcSession = sessionmaker(bind=src_engine, autoflush=False, autocommit=False)
    DstSession = sessionmaker(bind=dst_engine, autoflush=False, autocommit=False)

    # ── 2. 在目标 PG 建表（含 pg_trgm 扩展 + GIN 索引）──
    print("[1/5] 在 PostgreSQL 建表...")
    init_db(dst_engine)
    print("      完成")

    # ── 3. 按依赖顺序搬迁数据 ──
    print("[2/5] 搬迁数据...")
    with SrcSession() as src_s, DstSession() as dst_s:
        # users（无依赖）
        n_users = copy_table(src_s, dst_s, User)
        print(f"      users: {n_users} 行")

        # tags（依赖 user_id）
        n_tags = copy_table(src_s, dst_s, Tag)
        print(f"      tags:  {n_tags} 行")

        # notes（依赖 user_id）
        n_notes = copy_table(src_s, dst_s, Note)
        print(f"      notes: {n_notes} 行")

        # note_tags（依赖 note_id + tag_id）
        n_nt = copy_note_tags(src_s, dst_s)
        print(f"      note_tags: {n_nt} 行")

        dst_s.commit()
    print("      完成")

    # ── 4. 设置超级管理员 ──
    print("[3/5] 设置超级管理员...")
    with DstSession() as dst_s:
        result = dst_s.execute(
            text("UPDATE users SET role = 'admin' WHERE username = '温千禧'")
        )
        if result.rowcount == 0:
            print("      警告：未找到 username='温千禧' 的用户，请手动设置管理员")
        else:
            print(f"      已将 {result.rowcount} 个用户提升为 admin")
        dst_s.commit()
    print("      完成")

    # ── 5. 行数对比验证 ──
    print("[4/5] 行数验证...")
    tables = ["users", "tags", "notes", "note_tags"]
    all_ok = True
    with SrcSession() as src_s, DstSession() as dst_s:
        for t in tables:
            src_count = count_rows(src_s, t)
            dst_count = count_rows(dst_s, t)
            status = "✓" if src_count == dst_count else "✗"
            if src_count != dst_count:
                all_ok = False
            print(f"      {status} {t}: 源 {src_count} → 目标 {dst_count}")
    print("      完成")

    if all_ok:
        print("[5/5] 迁移成功完成！")
        print("      下一步：修改 .env 的 DATABASE_URL 指向 PostgreSQL，重启服务。")
    else:
        print("[5/5] 迁移完成，但行数不一致，请检查！")
        sys.exit(1)


if __name__ == "__main__":
    main()
