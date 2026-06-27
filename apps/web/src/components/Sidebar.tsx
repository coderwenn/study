// 左栏：新建按钮、标签列表（点击筛选）、退出
import { useAuth } from "../hooks/useAuth";
import { useTags } from "../hooks/useTags";
import type { Tag } from "../types";

interface Props {
  selectedTagId: number | null;
  onSelectTag: (id: number | null) => void;
  onCreate: () => void;
}

export default function Sidebar({ selectedTagId, onSelectTag, onCreate }: Props) {
  const { user, logout } = useAuth();
  const { data: tags = [] } = useTags();

  return (
    <div className="sidebar">
      <button className="btn" style={{ width: "100%" }} onClick={onCreate}>＋ 新建笔记</button>
      <div style={{ margin: "16px 0 4px", color: "#6b7280", fontSize: 12 }}>标签</div>
      <div className="tag-chip" style={{ display: "block", textAlign: "center" }}
           onClick={() => onSelectTag(null)}>
        全部
      </div>
      {tags.map((t: Tag) => (
        <div
          key={t.id}
          className={`tag-chip ${selectedTagId === t.id ? "active" : ""}`}
          style={{ display: "block" }}
          onClick={() => onSelectTag(selectedTagId === t.id ? null : t.id)}
        >
          # {t.name} ({t.note_count})
        </div>
      ))}
      <div style={{ position: "absolute", bottom: 12, fontSize: 12, color: "#6b7280" }}>
        👤 {user?.username} · <button className="btn-ghost" onClick={logout}>退出</button>
      </div>
    </div>
  );
}
