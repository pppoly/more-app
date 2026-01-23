# LINE MINI App / LIFF：官方文档要点（2026）

> Sources (official):
> - https://developers.line.biz/en/reference/liff/
> - https://developers.line.biz/en/docs/liff/opening-liff-app/
> - https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/
> - https://developers.line.biz/en/docs/line-mini-app/develop/share-messages/
> - https://developers.line.biz/en/docs/line-mini-app/develop/channel-consent-simplification/

## Summary
- **LIFF URL（入口 URL）**：支持 `https://liff.line.me/{liffId}`；`https://miniapp.line.me/{liffId}` 仅用于 LINE MINI App。`https://line.me/R/app/{liffId}` 与 `line://app/{liffId}` 已被标记为 deprecated。
- **分享（Share）**：分享某个“页面”时，官方推荐使用 **Permanent Link**（而不是 LIFF URL）；LINE 头部内置分享按钮会自动生成 permanent link，但内容不可自定义；要自定义分享内容需实现“页面内按钮”并通过 `liff.shareTargetPicker()` 发送自定义消息（Flex Message）。
- **初始化（liff.init）**：`liff.init()` 只保证在 **Endpoint URL 或其子路径** 上行为可预测；并且 **任何会改变 URL 的逻辑必须在 `liff.init()` 返回的 Promise resolve 之后** 执行。
- **登录/授权**：在 LIFF browser 内的 LINE Login 授权请求行为不保证；从外部浏览器或 LINE in-app browser 打开时，应使用 `liff.login()`（或 `config.withLoginOnExternalBrowser`）而不是普通 LINE Login 的授权请求。
- **Channel consent simplification**（Mini App 特性）：简化只覆盖 `openid`（拿 userId）；`profile` / `chat_message.write` 等仍需在“需要时”在各 Mini App 内通过 verification screen 再授权。

## INVALIDATES（相对旧知识的“必须更新点”）
- 不再建议使用 `line://app/{liffId}` / `https://line.me/R/app/{liffId}` 作为入口（deprecated）。
- “分享页面链接”不应默认分享 LIFF URL；官方明确：**分享页面应使用 permanent link**（头部 action button 会生成；其它场景需自行生成）。
- 不能在 `liff.init()` 完成前就做 SPA 路由跳转/`history.replaceState()`/`location.replace()` 等 URL 变更；官方明确要求把 URL 变更放到 `liff.init()` Promise resolve 之后。
- `liff.init()` 的“可保证行为”范围受 Endpoint URL 约束：如果你在不属于 endpoint（或其子路径）的 URL 上 init，会出现 warning，且部分特性“不保证可用”。
- `config.withLoginOnExternalBrowser` 的默认值是 **false**（不要假设自动登录）。

## Login flow（LINE MINI App / LIFF，按文档的可验证步骤）
1. 用户访问 LIFF URL（`https://miniapp.line.me/{liffId}` 或 `https://liff.line.me/{liffId}`）。
2. **第一次访问**时：从 LIFF server **重定向到 Primary redirect URL**（= Console 配置的 Endpoint URL）。此时若在入口 URL 里带了额外信息（path/query/hash），会被放入 `liff.state` query parameter。
3. 在 Primary redirect URL 页面执行 `liff.init()`（官方建议：此阶段不要做任何 URL 变更）。
4. 执行 `liff.init()` 后，用户会被重定向到 **Secondary redirect URL**，随后显示 LIFF app 页面。
5. 在 Mini App 场景下，若启用 **Channel consent simplification**：
   1) 首次出现“简化授权”时，只请求 `openid`（userId）；  
   2) 需要 `profile` / `chat_message.write` 等权限时，在 Mini App 内弹出 verification screen 再授权。
6. 当从外部浏览器/LINE in-app browser 打开且需要登录时：按 LIFF 文档使用 `liff.login()`（或 `withLoginOnExternalBrowser`），避免使用“普通 LINE Login 的授权请求”（文档注明在 LIFF browser 内不保证）。

## Sharing capabilities
### Built-in share（头部内置 action button）
- 由 LINE 提供并默认显示；**行为与分享内容不可自定义**。
- 当用户使用该按钮分享页面时，LINE 会为“当前页面”自动生成 permanent link。

### Share Target Picker（自定义分享）
- 在页面 body 实现自定义 action button；点击后拉起 target picker（选择好友/群）并发送开发者生成的消息（如 Flex Message）。
- 选择范围：仅包含用户的好友（含 OA）与所在群组；**不包含 OpenChat**。
- 条件与限制（文档明确点）：
  - 必须满足 share target picker 的启用/权限条件（包含“用户已登录”等条件）。
  - 在手机外部浏览器执行 `liff.shareTargetPicker()` 时，可能出现邮箱登录界面：文档解释这是因为 target picker 需要 SSO session，且某些 auto login 流程不会发放 SSO session。
  - 出于隐私：不会提供/返回“用户分享给了多少人”的信息。

### Share message format（Mini App 自定义分享消息）
- **头部按钮**不可定制；定制分享必须走 **body 按钮 + share target picker**。
- 自定义分享消息用 Flex Message：文档要求使用 **bubble** container；不要用 carousel container。
- Button 数量上限：最多 3 个；且至少一个按钮应打开“详情页”。
- 当按钮要打开“非 top page”时：文档要求使用 **permanent link**（而不是直接用 Endpoint URL 或随意拼接的 URL）。

## Environment constraints
- “访问 LIFF URL 后到底在哪个环境打开（LIFF browser / 外部浏览器）”**不保证**；受 OS/浏览器/宿主 WebView 影响（文档明确提醒）。
- 外部环境下：不要假设自动登录；`withLoginOnExternalBrowser` 默认 false，需要显式策略。
- 使用任何特性前：需要按 LIFF 文档用 `liff.isInClient()` / `liff.isApiAvailable()` 做能力判断（尤其 share target picker 等）。

## Rules (machine-readable)
```yaml
rules:
  entry_urls:
    supported:
      - "https://liff.line.me/{liffId}"
      - "https://miniapp.line.me/{liffId}  # only available in LINE MINI Apps"
    deprecated:
      - "https://line.me/R/app/{liffId}"
      - "line://app/{liffId}"
  permanent_links:
    use_for_sharing_pages: true
    formula: "LIFF URL + (Page URL - Endpoint URL)"
    allows:
      - "path"
      - "query"
      - "hash"
  liff_init:
    must_run_at_or_under_endpoint_url: true
    url_changes_only_after_init_promise_resolved: true
    primary_secondary_redirect_flow_exists: true
  external_login:
    withLoginOnExternalBrowser_default: false
    when_external_or_line_in_app_browser:
      - "use liff.login() (or set withLoginOnExternalBrowser) for login"
      - "avoid normal LINE Login authorization requests inside LIFF browser (not guaranteed)"
  share_target_picker:
    customize_share_requires_body_button: true
    header_share_customizable: false
    excludes_openchat: true
    requires_user_logged_in: true
    requires_console_enablement_and_scopes: true
    privacy_no_recipient_count: true
  channel_consent_simplification:
    skipped_scope_only: "openid"
    other_scopes_require_verification_screen: true
```

## Common traps (根因级别)
- **在 `liff.init()` resolve 前就做 SPA 路由跳转/URL rewrite**：会导致 `liff.state`/deep link 丢失、shareTargetPicker 偶发失败、回调参数被意外清理（官方明确要求 URL 变更延后）。
- **在不属于 Endpoint URL（或子路径）的页面执行 `liff.init()`**：会出现 warning，且部分 LIFF 特性“不保证可用”。
- **Endpoint URL 被 30x 重定向且丢 query**：LIFF 会把 deep link 放进 `liff.state` query param；如果 Nginx/Edge 对带 `liff.state` 的请求做 `301/302` 并且不保留 `$args`，则 `liff.state` 会在到达 SPA 前被丢弃，表现为“永远回到首页/列表”。检查方式：`curl -I "https://<endpoint>/?liff.state=abc"` 应返回 `200`（或至少保留 query）。
- **把“分享页面”当成分享普通网页链接**：官方对 Mini App 页面分享的推荐是 permanent link；否则容易出现“无法自动打开/无法落到指定页/缺少引导”。
- **误判授权范围**：启用 channel consent simplification ≠ 自动拿到 `profile/chat_message.write`；不主动触发 verification screen 会导致 profile/ID token payload 缺字段。
- **外部浏览器的 shareTargetPicker 体验**：可能被迫邮箱登录（SSO session 不存在）；需要产品层面接受或在 UI 上引导用户在 LINE 内打开。

## Open questions (NEEDS VERIFICATION)
- 我们当前 LINE Developers Console 配置的 **Endpoint URL**（是否带 path，例如 `/liff`）？这会直接影响 `liff.init()` 可保证行为范围与 permanent link 计算的“Endpoint URL”。
- 我们 Mini App 当前启用的 scopes（至少应覆盖 `openid`，分享需要 `chat_message.write`，以及是否需要 `profile`）？
- 我们的 Mini App 是否已完成“verified MINI App”配置；若未验证，channel consent simplification 的行为会受限制（文档提到仅在 developing/review Mini App 生效）。
