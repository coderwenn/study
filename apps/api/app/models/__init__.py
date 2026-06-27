# 集中导出模型，便于 Alembic 自动检测与别处导入
from app.models.user import User  # noqa: F401
from app.models.note import Note, note_tags  # noqa: F401
from app.models.tag import Tag  # noqa: F401
