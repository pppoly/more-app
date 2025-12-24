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
- 为解决“刷新时先看到空导航”问题，`/events/:eventId` 的路由改为 `defineAsyncComponent` 包裹，加载阶段由 `EventDetailSkeleton` 组件兜底；即使还在拉取页面 chunk，也能立即显示完整骨架。
- 后续发现 vue-router 不建议 `defineAsyncComponent` 直接用于路由组件，于是恢复为标准 `() => import(...)` 的写法并删掉临时 Skeleton 组件，避免控制台 warn。
- 移动端报名流重构：免费活动直接创建报名并进入 `MobileEventSuccess`，收费活动进入确认页并生成 30 分钟名额锁定（sessionStorage 持有、Stripe 成功回调 `PaymentSuccess` 会转跳至成功页）。新增 `MOBILE_EVENT_PENDING_PAYMENT_KEY` / `MOBILE_EVENT_SUCCESS_KEY` 统一管理跨页面状态。
- Console/移动报名流的页面参数改为通过 `defineProps` 接收，避免 `<Transition>` 包裹时出现 “Extraneous non-props attributes (eventId)” 与根节点 fragment warn；`watch(eventId)` 确保路由切换时自动重新加载详情。
- 后端 `getEventById` 现在返回 `visibility` + 票种列表，并在前端 `EventDetail` 类型中补齐 `ticketTypes`，移动报名页可以据此正确判断是否需要付款并携带 `ticketTypeId`。
- `MobileEventRegister/MobileEventCheckout` 统一封装价格文案（根据票种计算免费/区间），并将 Axios 错误信息向用户展示，免费报名 API 再返回 400 时能给出具体原因而不是只显示状态码。
- 去掉活动报名接口中“报名开始时间”限制（之前默认等于活动开始时间，导致所有活动在正式开始前都报 400），并让 Console 创建活动时默认把 `regStartTime` 设为 `new Date()`。现在活动一旦处于 `open` 状态就可以立即对外开放报名。
- 同时移除了 `regDeadline/regEndTime` 的硬性校验，避免因时间设置不一致导致 400。只要活动仍然是 `open` 状态，就允许报名通过，后续再根据产品需求引入更细的报名截止逻辑。
- 报名接口支持幂等：若同一用户已报名同一活动，不再抛 400，而是返回已有报名记录（含 event 信息），方便多次调试或重复提交。
- Console 社群创建/设定页改成 App 风格 UI，并加入 logo/封面上传区域：前端会居中裁切（logo 1:1、封面 16:9）后上传到后端 `/console/communities/uploads`，后端保存到 `/uploads/communities/...` 并返回可访问 URL，彻底解决 base64 过大导致的 413。

### 2025-11-21
- 修复移动端路由在 `<Transition>` 下重复报 “Extraneous non-props attributes (eventId)” 的问题：`App.vue` 现在根据当前 `route.matched` 解析并传递正确的 `props`，同时为每个页面注入唯一 key，避免过渡容器把参数当成 attrs。
- 活动报名页新增“可报名状态”校验，如果后台 `status !== 'open'` 或 `visibility` 限制为非公开，将在 UI 中提示“受付終了/限定公開”，并禁用 CTA 按钮，阻止继续调用报名接口。
- 免费报名流程在前端拦截这些状态后，再也不会直接打到 API 返回 400；同样的可报名校验也应用在“信息确认”入口，文案保持 iOS 风格提示。
- 前端 `npm run build` 验证通过，仅保留 router 对 `EventForm` 动态导入的既有提示。
- Console 首页的英雄区背景恢复为固定渐变，不再铺设用户上传的封面，避免素材色调干扰上层内容。
- AI 活动助手的使用说明改为可折叠：首次进入时显示卡片，开始对话或点击“收起说明”后腾出更多聊天空间，并可通过“查看使用说明”按钮随时再展开。
- AI 助手对话区继续收敛左右溢出，并把“AI 思考过程”改为默认折叠的全宽卡片；“下一步灵感”“草稿摘要”也统一加大字号和 padding，突出重点输出并提升手机端可读性。
- “AI 思考过程”折叠现在针对每条消息独立展开，避免一处点击影响全部；需要补充/确认、草案摘要卡片也统一成 iOS 风格大字号，以提升可读性。
- 只有进入 Writer 阶段时才会渲染草案摘要，防止初始欢迎消息就出现空白的 Writer 卡片。
- 发送按钮会主动 blur 输入框并重置键盘偏移，解决长文本发送后输入区无法回到原位的问题。
- 会话历史改为真正的列表+预览：点“查看”只在面板内展开预览，用户确认后再选择“载入对话”或“送到表单”，不会再把卡片直接插入聊天且无法关闭。
- 历史草案抽屉支持默认选中最新一条，载入操作会自动滚动并关闭面板，同时在预览中提示“载入/送出”的具体行为，缓解用户对操作结果的焦虑。
- Mobile 我的页面增加原生风格的头像裁剪弹层：选择照片后可拖动/缩放并预览，确认才上传，失败会提示原因，提升交互体验。
- 报名成功页改成简单提示卡，只显示成功 icon、文案和两个跳转按钮，减少干扰。
- Console mobile event form:
  - Shell header uses left text back + centered title; hides generic MORE header on non-console routes.
  - Category picker now opens a sheet instead of web dropdown; placeholder aligned.
  - Rich text detail editing moved to dedicated mobile page (ConsoleMobileEventNoteEditor); form state persisted via session storage to avoid clearing on return; helper texts removed.
  - Layout fixes: aligned cards/padding, removed in-form header, prevented auto-scroll on mount, cover panel width overflow fixes; detail row aligned like other inputs; removed quick date chips.
  - Draft can be saved without cover; publishing still requires at least one cover.
  - Persist form draft before opening note editor and restore on return.
  - Event ID now tracked via query/params; after first create, route is replaced with ?eventId so subsequent saves update same event.
- Paste flow (ConsoleEventPasteMobile): removed textarea hint; added loading state on “下一步”; calls extractEventDraft before navigating and stores result for the form.
- Event list/management (mobile): tapping a draft in ConsoleCommunityEventsMobile opens the mobile form with eventId to continue editing; manage page edit button also routes to mobile form with eventId.

### Compliance Review Queue (No Changes Applied)
- LINE 品牌使用合规性：仅文字引用是否符合品牌规范、是否需要额外声明（refs: frontend/src/views/auth/Login.vue, frontend/src/components/common/LiffOpenPrompt.vue, frontend/src/components/common/LineRedirectOverlay.vue, frontend/src/views/mobile/MobileEventDetail.vue）
- 支付“测试环境”提示一致性：支付入口/结果页是否有明确“测试不收费”提示（refs: frontend/src/views/events/EventDetail.vue, frontend/src/views/mobile/MobileEventDetail.vue, frontend/src/views/mobile/MobileEventCheckout.vue, frontend/src/views/payments/PaymentSuccess.vue, frontend/src/views/payments/PaymentCancel.vue）
- 第三方处理方披露（OpenAI/Google Cloud/Stripe/LINE）：隐私政策是否明确列出处理方与用途（refs: frontend/public/legal/privacy/index.html, backend/src/ai/ai.service.ts, backend/src/common/moderation/content-moderation.service.ts, backend/src/stripe, backend/src/auth）
- 法律文本单一来源与同步：`/legal` 与 `frontend/public/legal` 是否一致（refs: legal/privacy/*.md, legal/terms/*.md, frontend/public/legal/privacy/index.html, frontend/public/legal/terms/index.html）
- OSS 依赖许可与归档：是否需要 `LICENSE` 与 `THIRD_PARTY_NOTICES`（refs: frontend/package.json, frontend/package-lock.json, backend/package.json, backend/package-lock.json）
- 用户数据收集范围与最小化披露：报名表/头像/位置/上传是否在隐私中明确（refs: frontend/src/views/mobile/MobileEventRegister.vue, frontend/src/views/auth/SetupProfile.vue, frontend/src/components/console/LocationPicker.vue）
- 测试登录/快速登录风险说明：测试登录是否会在非测试环境暴露（refs: frontend/src/views/auth/Login.vue, frontend/src/router/index.ts）

### Compliance Review Queue (UGC Organizer Terms)
- 主理人协议需补充：权利与授权保证、平台中立与通报处置、申诉/下架协作、赔偿补偿义务（refs: legal/organizer/ja/organizer_tos_v1.0.md）
