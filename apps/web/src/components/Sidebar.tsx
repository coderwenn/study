// 左栏：品牌区 / 新建笔记 / 标签筛选（点击切换）/ 废纸篓 / 账户退出
// 视图切换：通过 view + onViewChange 控制「全部笔记」与「废纸篓」两种视图
// 收藏、帮助 暂无后端逻辑，仅作视觉占位，遵循现有逻辑不接入假功能。
// 设置已接入：点击打开主题切换弹窗（SettingsDialog）。
import { useEffect, useState } from "react";
import { Plus, FileText, Tag, Star, Trash2, Settings, Info, LogOut, Link2, Upload } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTags } from "../hooks/useTags";
import { useTheme } from "../hooks/useTheme";
import { useTrashList } from "../hooks/useNotes";
import ConfirmDialog from "./ConfirmDialog";
import SettingsDialog from "./SettingsDialog";
import type { Tag as TagType } from "../types";

export type View = "notes" | "trash";

interface Props {
  view: View;
  onViewChange: (v: View) => void;
  selectedTagId: number | null;
  onSelectTag: (id: number | null) => void;
  onCreate: () => void;
  onSummarize: () => void; // 打开「从链接总结」弹窗
  onImport: () => void;   // 打开「导入 Markdown」弹窗
}

// 导航项的公共类名（激活/非激活在调用处拼接）
const itemBase =
  "flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer border-r-[3px] border-transparent transition-colors";

export default function Sidebar({ view, onViewChange, selectedTagId, onSelectTag, onCreate, onSummarize, onImport }: Props) {
  const { user, logout } = useAuth();
  const { data: tags = [] } = useTags();
  const { data: trash = [] } = useTrashList();
  const { theme } = useTheme();
  // 仅展示有笔记引用的标签（note_count > 0），空标签不占「标签位」
  const visibleTags = tags.filter((t) => t.note_count > 0);
  // 选中的标签变空（被过滤）或被删除时，自动回到「全部」，避免「无高亮 + 空列表」悬空态
  useEffect(() => {
    if (selectedTagId !== null && !visibleTags.some((t) => t.id === selectedTagId)) {
      onSelectTag(null);
    }
  }, [visibleTags, selectedTagId, onSelectTag]);
  // 退出确认弹窗的开关
  const [showLogout, setShowLogout] = useState(false);
  // 设置弹窗的开关
  const [showSettings, setShowSettings] = useState(false);

  // 用户名首字母作头像（无用户名时回退到 "U"）
  const initial = (user?.username?.[0] ?? "U").toUpperCase();

  // 在「废纸篓」视图下，点击标签不应切换回 notes 视图
  const handleSelectTag = (id: number | null) => {
    if (view !== "notes") onViewChange("notes");
    onSelectTag(id);
  };

  return (
    <aside className="w-[184px] shrink-0 h-full bg-surface-container-low border-r border-outline-variant flex flex-col py-5">
      {/* 品牌 */}
      <div className="px-4 mb-6">
        <h1 className="text-lg font-bold tracking-tight text-primary m-0">Notes Pro</h1>
        <p className="text-xs text-on-surface-variant">Personal Workspace</p>
      </div>

      {/* 新建笔记 */}
      <div className="px-4 mb-6">
        <button
          onClick={onCreate}
          className="w-full bg-primary hover:bg-primary-dark text-white font-medium px-4 rounded-md flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-sm py-1.5 text-sm"
        >
          <Plus className="w-[18px] h-[18px]" />
          <span>新建笔记</span>
        </button>
        <button
          onClick={onSummarize}
          className="w-full mt-2 border border-outline-variant hover:bg-surface-container-low text-on-surface font-medium px-4 rounded-md flex items-center justify-center gap-2 transition-colors py-1.5 text-sm"
        >
          <Link2 className="w-[18px] h-[18px]" />
          <span>从链接总结</span>
        </button>
        <button
          onClick={onImport}
          className="w-full mt-2 border border-outline-variant hover:bg-surface-container-low text-on-surface font-medium px-4 rounded-md flex items-center justify-center gap-2 transition-colors py-1.5 text-sm"
        >
          <Upload className="w-[18px] h-[18px]" />
          <span>导入 Markdown</span>
        </button>
      </div>

      {/* 导航：标签分组 */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        <div className="px-4 mb-2 text-[11px] font-semibold text-outline uppercase tracking-wider">
          标签
        </div>

        {/* 全部笔记：tagId === null 且 view === "notes" 时激活 */}
        <div
          onClick={() => {
            onViewChange("notes");
            onSelectTag(null);
          }}
          className={`${itemBase} ${
            view === "notes" && selectedTagId === null
              ? "bg-surface-raised/60 text-primary border-primary font-medium"
              : "text-on-surface-variant hover:bg-surface-container-highest"
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>全部</span>
        </div>

        {/* 各标签：再次点击同一个标签取消筛选 */}
        {visibleTags.map((t: TagType) => (
          <div
            key={t.id}
            onClick={() => handleSelectTag(selectedTagId === t.id ? null : t.id)}
            className={`${itemBase} ${
              view === "notes" && selectedTagId === t.id
                ? "bg-surface-raised/60 text-primary border-primary font-medium"
                : "text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            <Tag className="w-5 h-5" />
            <span className="truncate">{t.name}</span>
            <span className="ml-auto text-xs text-outline">{t.note_count}</span>
          </div>
        ))}

        {/* 废纸篓：可点击进入废纸篓视图，有数量角标 */}
        <div className="pt-4 space-y-1">
          <div
            onClick={() => onViewChange("trash")}
            title="查看已删除的笔记"
            className={`${itemBase} ${
              view === "trash"
                ? "bg-surface-raised/60 text-primary border-primary font-medium"
                : "text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            <Trash2 className="w-5 h-5" />
            <span>废纸篓</span>
            {trash.length > 0 && (
              <span className="ml-auto text-xs text-outline">{trash.length}</span>
            )}
          </div>
          {/* 收藏：占位 */}
          <div className={`${itemBase} text-on-surface-variant opacity-50 cursor-not-allowed`} title="敬请期待">
            <Star className="w-5 h-5" />
            <span>收藏</span>
          </div>
        </div>
      </nav>

      {/* 底部：设置 / 帮助 + 账户退出 */}
      <div className="mt-auto border-t border-outline-variant pt-4 space-y-1">
        <div
          onClick={() => setShowSettings(true)}
          title="主题与外观设置"
          className={`${itemBase} text-on-surface-variant hover:bg-surface-container-highest`}
        >
          <Settings className="w-5 h-5" />
          <span>设置</span>
          {/* 当前主题指示器 */}
          <span className="ml-auto text-[10px] text-on-surface-muted uppercase tracking-wider">
            {theme === "dark" ? "暗色" : "亮色"}
          </span>
        </div>
        <div className={`${itemBase} text-on-surface-variant opacity-50 cursor-not-allowed`} title="敬请期待">
          <Info className="w-5 h-5" />
          <span>帮助</span>
        </div>

        {/* 账户区：头像 + 用户名 + 退出 */}
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <div className="w-[30px] h-[30px] rounded-full bg-primary text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
            {initial}
          </div>
          <span className="text-[13px] font-medium text-on-surface truncate">{user?.username ?? "用户"}</span>
          <button
            onClick={() => setShowLogout(true)}
            title="退出登录"
            aria-label="退出登录"
            className="ml-auto p-1.5 rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-error transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* 退出确认弹窗：确认后才真正登出，避免误触 */}
      <ConfirmDialog
        open={showLogout}
        title="确认退出登录?"
        message="你将返回登录页面，需要重新输入账号密码。"
        confirmText="退出"
        cancelText="取消"
        danger
        onConfirm={() => {
          setShowLogout(false);
          logout();
        }}
        onCancel={() => setShowLogout(false)}
      />

      {/* 设置弹窗：主题切换（亮色 / 暗色），含预览 */}
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
    </aside>
  );
}
