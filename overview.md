# Notes Pro · Lumina 设计语言改造

> 由 UI Designer 主导的界面现代化重构。将原有 Material Design 3 风格升级为「Lumina」柔光质感设计语言。

## 设计理念

**Lumina** —— 以光与质感为核心，为笔记工作台注入优雅、层次分明的现代视觉表达。

## 核心改造

### 1. 设计 Token 系统（`tailwind.config.js`）

| 维度 | 改造前 | 改造后 |
| --- | --- | --- |
| **主色** | 蓝色 `#2563eb` | 靛蓝紫渐变 `#6366f1 → #4f46e5` |
| **表面层** | 偏紫灰 `#faf8ff` | 纯净中性灰 `#fafafa` + 新增 `surface-raised` / `surface-hover` |
| **文字** | 单一灰阶 | 三级层次：`on-surface` / `on-surface-variant` / `on-surface-muted` |
| **阴影** | 仅 `shadow-sm` | 六层柔和投影体系 `soft-sm → soft-xl` + 聚焦发光 `glow` |
| **圆角** | 仅 `md: 8px` | 分层体系 `md/lg/xl/2xl`（8/12/16/20px） |
| **动效** | 无 | 4 组关键帧 + 优雅缓动 `out-expo` / `spring` |

### 2. 视觉层次

- **多层柔和投影**：`soft-sm → soft-xl` 营造悬浮质感，告别扁平
- **玻璃质感顶栏**：`backdrop-blur` 半透明粘性顶栏与工具栏
- **主色发光环**：聚焦态用 `shadow-glow` 替代生硬 ring
- **渐变表达**：主色按钮、品牌图标、标签药丸均采用渐变填充

### 3. 微交互动效

- 按钮悬停 `translateY(-2px)` + 发光强化，按压 `scale(0.98)` 回弹
- 弹窗 `scale-in` 缩放进场 + 遮罩 `fade-in` 淡入
- 列表项悬停柔光背景过渡，激活态主色指示条
- 统一 `200ms / cubic-bezier(0.16, 1, 0.3, 1)` 缓动曲线

### 4. 间距与对齐

- 4px 基准间距系统贯穿全局
- 侧栏导航项统一 `mx-2 px-3 py-2` 圆角胶囊
- 列表项卡片化 `p-3 mb-1 rounded-lg`，间距精准统一

### 5. 响应式与可访问性

- 三栏布局 `flex` + `min-w-0` + `shrink-0`，自适应剩余空间
- WCAG AA 对比度：主文字 `#18181b` on `#fafafa`（对比度 > 15:1）
- 焦点可见态统一发光环，键盘可达
- 触控目标 ≥ 32px，关键按钮达 44px

## 改造文件清单

| 文件 | 改造内容 |
| --- | --- |
| `apps/web/tailwind.config.js` | 设计 Token 全面升级 |
| `apps/web/src/index.css` | 滚动条、选中色、保护开关质感 |
| `apps/web/src/pages/LoginPage.tsx` | 柔光渐变背景 + 玻璃卡片 |
| `apps/web/src/components/Sidebar.tsx` | 胶囊高亮导航 + 渐变按钮 |
| `apps/web/src/components/NoteList.tsx` | 卡片化列表 + 聚焦发光搜索 |
| `apps/web/src/components/NoteEditor.tsx` | 玻璃顶栏 + 统一操作按钮 |
| `apps/web/src/components/EditorToolbar.tsx` | 玻璃工具栏 + 悬停柔光 |
| `apps/web/src/components/TagPicker.tsx` | 渐变药丸 + 描边卡片 |
| `apps/web/src/components/MarkdownSplit.tsx` | prose 排版配色优化 |
| `apps/web/src/components/ConfirmDialog.tsx` | 缩放进场 + 模糊遮罩 |
| `apps/web/src/components/SummarizeDialog.tsx` | 各阶段视觉精致化 |

## 验证

- ✅ TypeScript 类型检查通过
- ✅ Vite 生产构建成功（CSS 48.77 kB / gzip 8.62 kB）
- ✅ 现有单元测试断言（文本与回调）不受样式改造影响

## 预览

本地静态预览：`http://localhost:4173`（登录页可直接体验新设计语言）

完整功能体验（含主界面三栏）：`pnpm dev` 启动前后端
