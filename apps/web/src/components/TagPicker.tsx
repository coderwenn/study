// 标签选择器：展示当前用户所有标签，可勾选；可新建标签
import { useState } from "react";
import { useTags, useCreateTag } from "../hooks/useTags";
import type { TagRef } from "../types";

interface Props {
  selected: number[];
  onChange: (ids: number[]) => void;
}

export default function TagPicker({ selected, onChange }: Props) {
  // 拉取当前用户的所有标签（note_count 由后端 list 接口返回）
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const [name, setName] = useState("");

  // 切换某标签的选中状态
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  // 新建标签并立即选中
  async function add() {
    if (!name.trim()) return;
    const t = await createTag.mutateAsync(name.trim());
    setName("");
    onChange([...selected, t.id]);
  }

  return (
    <div>
      {tags.map((t: TagRef & { note_count?: number }) => (
        <span
          key={t.id}
          className={`tag-chip ${selected.includes(t.id) ? "active" : ""}`}
          onClick={() => toggle(t.id)}
        >
          # {t.name}
        </span>
      ))}
      <span style={{ marginLeft: 8 }}>
        <input
          placeholder="新标签…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "2px 6px", width: 80, fontSize: 12 }}
        />
        <button className="btn-ghost" onClick={add}>
          ＋
        </button>
      </span>
    </div>
  );
}
