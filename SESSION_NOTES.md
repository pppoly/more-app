## Session Notes

### 2025-11-19
- Standardized every mobile/console form interaction to feel iOS-native: inline inputs with no web-style borders, direct contenteditable for quick editing, and immediate date picker triggers.
- Unified all white cards, hero sections, and overlays across the product to use a consistent 12px corner radius for visual alignment.
- Built a custom iOS-style date/time picker (with 00/15/30/45 minute steps) and wired it into the event form’s datetime editor, replacing the native picker.
- Replaced the routed活动详情编辑器 with an inline full-screen overlay, so editing笔记不再跳页，滚动位置也通过 session 缓存即时恢复。
- Removed 招募表单中残留的 contenteditable，改成透明输入框（与标题/场所一致），彻底消除输入法光标错乱；同时所有白卡/hero 统一用 12px 圆角。

### 2025-11-20
- Cleaned up `ConsoleEventForm.vue` after noticing duplicate `<style>` endings injected stray JS/CSS into the build. The stray block prevented `uploadPendingCovers` from being defined at runtime, so I moved the missing builder styles inside the scoped block, removed the duplicate functions, and restored a single closing tag—fixing the “Can’t find variable: uploadPendingCovers” error seen on save.
- Added全新 `ConsoleEventPublishSuccessMobile` 页面，展示活动详情、下一步提醒，并提供“查看活动详情 / 返回 Console”操作。
- `EventForm` 在发布成功后会根据布局判断：移动端跳转至成功页面，桌面端保持原有返回逻辑；同时新增 router `ConsoleMobileEventPublishSuccess` 供跳转使用。
- 活动表单新增“复制历史活动”流程：可从同社群的活动列表中选择一条，一键填充标题/时间/报名表等所有字段（支持移动端底部弹层与桌面卡片入口）。
- 复制活动同时会把原活动的封面下载为本地 File，生成缩略图并加入上传队列；活动详情中的图片在复制时也会被保留在富文本 HTML 中。
- Console 端活动列表/API 现已返回真实封面 URL，移动端 Console 首页/活动列表、桌面 Console 活动列表都会优先显示实际封面，只有没有封面时才回退到默认占位图。
- 公共活动列表（桌面 `/events` + 移动 `/events`）以及 `GET /events` API 同步支持真实封面：后端 `listPublicOpenEvents` 会返回 `coverImageUrl`，前端统一通过 `resolveAssetUrl` 转成可访问的 `/uploads/...` 完整地址。
