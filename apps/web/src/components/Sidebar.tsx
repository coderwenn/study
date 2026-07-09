// 左栏：品牌区 / 新建笔记 / 标签筛选（点击切换）/ 收藏·废纸篓（占位）/ 账户退出
// Lumina 设计：胶囊高亮导航、主色渐变按钮、精致账户区、统一圆角与过渡。
// 收藏、废纸篓、设置、帮助 暂无后端逻辑，仅作视觉占位，遵循现有逻辑不接入假功能。
import { useEffect, useState } from "react";
import { Plus, FileText, Tag, Star, Trash2, Settings, Info, LogOut, Link2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTags } from "../hooks/useTags";
import ConfirmDialog from "./ConfirmDialog";
import type { Tag as TagType } from "../types";

interface Props {
  selectedTagId: number | null;
  onSelectTag: (id: number | null) => void;
  onCreate: () => void;
  onSummarize: () => void; // 打开「从链接总结」弹窗
}

// 导航项公共类名：圆角胶囊 + 统一过渡（激活/非激活在调用处拼接）
const itemBase =
  "flex items-center gap-2.5 mx-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-all duration-200 ease-out-expo";

export default function Sidebar({ selectedTagId, onSelectTag, onCreate, onSummarize }: Props) {
  const { user, logout } = useAuth();
  const { data: tags = [] } = useTags();
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

  // 用户名首字母作头像（无用户名时回退到 "U"）
  const initial = (user?.username?.[0] ?? "U").toUpperCase();

  return (
    <aside className="w-[200px] shrink-0 h-full bg-surface-container-low border-r border-outline-variant flex flex-col py-5">
      {/* 品牌 */}
      <div className="px-5 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-soft-sm">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-on-surface m-0 leading-tight">Notes Pro</h1>
            <p className="text-[11px] text-on-surface-muted leading-tight">Personal Workspace</p>
          </div>
        </div>
      </div>

      {/* 新建笔记 + 从链接总结 */}
      <div className="px-3 mb-5 space-y-2">
        <button
          onClick={onCreate}
          className="w-full bg-gradient-to-br from-primary to-primary-dark hover:shadow-glow-primary text-white font-medium px-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ease-out-expo hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] shadow-soft py-2 text-sm"
        >
          <Plus className="w-[18px] h-[18px]" />
          <span>新建笔记</span>
        </button>
        <button
          onClick={onSummarize}
          className="w-full border border-outline-variant hover:border-primary/40 hover:bg-primary-soft/50 hover:text-primary text-on-surface-variant font-medium px-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ease-out-expo py-2 text-sm"
        >
          <Link2 className="w-[16px] h-[16px]" />
          <span>从链接总结</span>
        </button>
      </div>

      {/* 导航：标签分组 */}
      <nav className="flex-1 overflow-y-auto">
        <div className="px-5 mb-1.5 text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
          标签
        </div>

        {/* 全部笔记：tagId === null 时激活 */}
        <div
          onClick={() => onSelectTag(null)}
          className={`${itemBase} ${
            selectedTagId === null
              ? "bg-primary-soft text-primary font-medium"
              : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
          }`}
        >
          <FileText className="w-[18px] h-[18px] shrink-0" />
          <span>全部</span>
        </div>

        {/* 各标签：再次点击同一个标签取消筛选 */}
        {visibleTags.map((t: TagType) => (
          <div
            key={t.id}
            onClick={() => onSelectTag(selectedTagId === t.id ? null : t.id)}
            className={`${itemBase} ${
              selectedTagId === t.id
                ? "bg-primary-soft text-primary font-medium"
                : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
            }`}
          >
            <Tag className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate flex-1">{t.name}</span>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md tabular-nums ${
                selectedTagId === t.id
                  ? "bg-primary/15 text-primary"
                  : "bg-surface-container-highest text-on-surface-muted"
              }`}
            >
              {t.note_count}
            </span>
          </div>
        ))}

        {/* 视觉占位分组：收藏 / 废纸篓（暂无对应数据逻辑） */}
        <div className="pt-3 mt-2 border-t border-outline-variant/60 mx-4">
          <div
            className={`${itemBase} text-on-surface-muted hover:bg-surface-hover hover:text-on-surface-variant cursor-not-allowed opacity-70`}
            title="敬请期待"
          >
            <Star className="w-[18px] h-[18px] shrink-0" />
            <span>收藏</span>
          </div>
          <div
            className={`${itemBase} text-on-surface-muted hover:bg-surface-hover hover:text-on-surface-variant cursor-not-allowed opacity-70`}
            title="敬请期待"
          >
            <Trash2 className="w-[18px] h-[18px] shrink-0" />
            <span>废纸篓</span>
          </div>
        </div>
      </nav>

      {/* 底部：设置 / 帮助 + 账户退出 */}
      <div className="mt-auto pt-3 border-t border-outline-variant">
        <div
          className={`${itemBase} text-on-surface-muted hover:bg-surface-hover hover:text-on-surface-variant cursor-not-allowed opacity-70`}
          title="敬请期待"
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span>设置</span>
        </div>
        <div
          className={`${itemBase} text-on-surface-muted hover:bg-surface-hover hover:text-on-surface-variant cursor-not-allowed opacity-70`}
          title="敬请期待"
        >
          <Info className="w-[18px] h-[18px] shrink-0" />
          <span>帮助</span>
        </div>

        {/* 账户区：头像 + 用户名 + 退出 */}
        <div className="flex items-center gap-2.5 mx-2 px-2 mt-2 py-2 rounded-lg hover:bg-surface-hover transition-colors duration-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white flex items-center justify-center text-xs font-semibold shrink-0 shadow-soft-sm">
            {initial}
          </div>
          <span className="text-[13px] font-medium text-on-surface truncate flex-1">
            {user?.username ?? "用户"}
          </span>
          <button
            onClick={() => setShowLogout(true)}
            title="退出登录"
            aria-label="退出登录"
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-error/10 hover:text-error transition-colors duration-200"
          >
            <LogOut className="w-[16px] h-[16px]" />
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
    </aside>
  );
}
