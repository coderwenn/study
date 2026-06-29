// 标签选择器：已选标签显示为药丸（× 移除），未选显示为描边卡片（点击添加），
// 虚线 + 按钮新建标签并立即选中。沿用「切换全部标签」的现有逻辑。
import { useState } from "react";
import { X, Plus } from "lucide-react";
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
  const [adding, setAdding] = useState(false); // 是否展开新建输入框
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // 已选标签：药丸 + ×
  const selectedTags = tags.filter((t) => selected.includes(t.id));
  // 未选标签：描边卡片，点击添加
  const availableTags = tags.filter((t) => !selected.includes(t.id));

  // 添加某标签（从描边卡片点击）
  function add(id: number) {
    onChange([...selected, id]);
  }
  // 移除某标签（药丸上的 ×）
  function remove(id: number) {
    onChange(selected.filter((x) => x !== id));
  }

  // 新建标签并立即选中
  async function create() {
    if (!name.trim()) return;
    try {
      const t = await createTag.mutateAsync(name.trim());
      setName("");
      setError("");
      setAdding(false);
      onChange([...selected, t.id]);
    } catch {
      setError("已存在或创建失败");
    }
  }

  return (
    <div className="px-8 pt-6 pb-3 flex flex-wrap items-center gap-2">
      {/* 已选标签：药丸 + × */}
      {selectedTags.map((t: TagRef) => (
        <span
          key={t.id}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-md"
        >
          <span># {t.name}</span>
          <button
            onClick={() => remove(t.id)}
            title={`移除 #${t.name}`}
            className="text-primary hover:text-primary-dark transition-colors p-0 flex"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}

      {/* 未选标签：描边卡片，点击添加 */}
      {availableTags.map((t: TagRef) => (
        <span
          key={t.id}
          onClick={() => add(t.id)}
          title={`添加 #${t.name}`}
          className="flex items-center gap-1 px-2.5 py-1 border border-outline-variant text-on-surface-variant text-xs font-medium rounded-md cursor-pointer hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span># {t.name}</span>
        </span>
      ))}

      {/* 新建标签 */}
      {adding ? (
        <span className="flex items-center gap-2">
          <input
            autoFocus
            placeholder="标签名..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
                setError("");
              }
            }}
            onBlur={() => {
              if (!name.trim()) setAdding(false);
            }}
            className="px-2 py-1 w-24 text-xs border border-primary rounded-md bg-white text-on-surface focus:outline-none"
          />
          {error && <span className="text-red-500 text-xs">{error}</span>}
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="新建标签"
          className="w-7 h-7 flex items-center justify-center border border-dashed border-outline-variant rounded-md text-outline hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="w-[18px] h-[18px]" />
        </button>
      )}
    </div>
  );
}
