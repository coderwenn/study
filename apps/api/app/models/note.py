# 笔记表：按 user_id 隔离；is_protected 防误删；is_deleted 软删除；is_pinned 置顶
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Table, Column, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# 笔记 ↔ 标签 多对多关联表
note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_id", ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")

    # 防误删保护：开启后禁止删除（即便走软删除也拦截，避免误操作进入废纸篓）
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False)

    # 软删除（废纸篓）：True 表示已移入废纸篓，正常列表不展示
    # deleted_at 记录移入废纸篓时间，便于后续自动清理策略
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    # 置顶：True 表示该笔记在列表中优先展示
    # pinned_at 记录置顶时间，多条置顶笔记按此字段倒序排列
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    tags: Mapped[list["Tag"]] = relationship(secondary=note_tags, back_populates="notes")
