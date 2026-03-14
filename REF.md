# VibeGo

A Web IDE built for professionals, designed for Vibe Coding anytime, anywhere. Freely use your Claude Code, Gemini CLI, CodeX, OpenCode, and more.

为专业人士打造，支持随时随地 Vibe Coding 的 Web IDE。 自由使用你的 Claude Code、Gemini CLI、CodeX、OpenCode 及更多工具。

## 技术栈

### 前端

框架：react, react-dom
界面库：shadcn/ui, tailwindcss
图标库：lucide-react
状态管理：Zustand
编辑器组件：monaco-editor
Git diff 组件：codemirror
版本号比较库：compare-versions
列表渲染组件：@tanstack/react-virtual
文件树组件：react-arborist
Markdown 渲染组件：react-markdown
数据存储：Dexie.js
终端渲染库：xterm.js
终端输出流解析：byline, split
缓存：memoize-one, mem, p-memoize, quick-lru

### 后端

框架：Golang, Gin
Git：github.com/go-git/go-git
WebSocket：github.com/gorilla/websocket
定制 PTY 库：github.com/xxnuo/gotty
文件监控：github.com/fsnotify/fsnotify
数据库：SQLite (使用 gorm.io/gorm 和 github.com/glebarez/sqlite 驱动)

## Git 页面优化计划

参考 GitHub Desktop 设计，按优先级逐步实现。

### 高价值

- [x] 1. 变更文件搜索/过滤 - 文件列表顶部加搜索框，按文件名模糊过滤
- [x] 2. 无变更智能建议 - 根据分支状态显示 publish/push/pull/stash 等操作卡片
- [x] 4. 提交详情展开增强 - 行变更统计(+N/-N)、Tag 展示、SHA 复制按钮
- [ ] 5. 提交操作菜单 - revert/create branch from commit/tag 管理/checkout commit/copy SHA（移动端优先按钮，非右键菜单）

### 中等价值

- [ ] 6. 分支切换 Stash 通知 - stash 发生时显示 toast 通知
- [x] 7. 提交后撤销 Toast - 成功提交后底部闪现可撤销的 toast
- [ ] 8. 文件操作菜单 - ignore(.gitignore)/复制路径（移动端适配）
- [x] 9. Commit 摘要长度提示 - 超过 72 字符时变色提醒
- [x] 10. 历史记录无限加载 - 滚动到底部时按需加载更多 commits

### 进阶特性

- [ ] 11. Merge 操作 - 分支视图直接 merge，含冲突预检
- [ ] 12. Cherry-pick / Squash / Reorder - 历史操作增强
- [ ] 13. AI 生成 Commit Message
- [ ] 14. Co-Author 支持 - 提交消息添加 Co-Authored-By
- [ ] 15. Rename Branch - 分支重命名
