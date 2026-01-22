# LINE Official Docs Notes

## Channel consent simplification (LINE MINI App /develop/channel-consent-simplification/)
- Simplification only auto-consents to the `openid` scope (user ID); `profile`, `email`, `chat_message.write`, `friendship`, etc. still require the in-app verification screen when first needed.
- When calling APIs that need those scopes (e.g., `liff.getProfile()`, `liff.getIDToken()`, `liff.sendMessages()`), call `liff.permission.query()` and `liff.permission.requestAll()` to show the verification modal before touching the API.
- Users who skip the simplification will always see the per-channel consent screen until the simplified consent is shown again after 24 hours.
- Verified channels created after 8 Jan 2026 have simplification enabled by default; older channels must enable it manually and meet runtime conditions (v2.13+ SDK, not LIFF-to-LIFF transition, verified MINI App).
- Add friend option needs scopes beyond `openid`; enabling simplification without requesting those scopes hides the add-friend prompt, so request extra scopes explicitly.
- For services relying on ID token payload/profile data, request the necessary scopes before exchanging tokens; otherwise the payload omits profile info.

## Login flow in LINE MINI Apps
- First-time users see the simplification consent screen to approve `openid`. After they consent, future LINE MINI Apps (with simplification enabled) skip the channel consent screen.
- When additional scopes are required, the verification screen runs on demand, not at app launch. Design your flows to request scopes only when needed, so the first screen the user sees remains minimal.
- The client must explicitly trigger LINE Login for external browsers using `withLoginOnExternalBrowser: true` in `liff.init()` or call `liff.login()` after checking `liff.isLoggedIn()`.
- External browsers do not automatically run LINE Login through `liff.init()`, so guard calls to share/permission APIs accordingly.

## Sharing capabilities (LINE MINI App /develop/share-messages/)
- The default header share action is controlled by LINE and cannot be customized. Use a custom body button if you need branded share content.
- Custom share messages must use Flex Message format with sections A–F (hero image, title, subtitle, detail list, buttons, footer) and only “standard” or “image-list” types; carousels are disallowed.
- Include at least one button that opens a detail page, and keep the hero image/summary concise so the message doesn’t require scrolling.
- Display the share target picker via `liff.shareTargetPicker()` after ensuring the LIFF SDK is logged in and ready; calling before login results in `UNAUTHORIZED`.
- The share-target picker can send Flex messages (the recommended format) and is the only way to send custom content.

## Environment differences
- LIFF browser (LINE in-app/minni): most APIs are available; `shareTargetPicker` works when the user is logged in and permissions are granted.
- External browser: login is not automatic—set `withLoginOnExternalBrowser: true` or explicitly `liff.login()` after checking `liff.isLoggedIn()`.
- Some APIs (e.g., camera, other privileged features) are not available outside the LINE clients; always check `liff.isInClient()`/`liff.isApiAvailable()` before invoking.
- When the LINE app targets a LIFF-to-LIFF transition, channel-consent simplification may not activate; verify the entry flow.

## Implementation checklist reminders
1. Always guard share/permission APIs with `isLineInAppBrowser()`/`liff.isInClient()` and a logged-in LIFF session.
2. For each scope beyond `openid`, call `liff.permission.query()` and `liff.permission.requestAll()` before calling the dependent API.
3. For external browsers, set `withLoginOnExternalBrowser: true` in `liff.init()` or run `liff.login()` manually after init.
4. Build custom share Flex messages strictly under the standard/image-list structure defined by LINE MINI app docs.
5. Track the guard route (session storage) when invoking share target picker because some LINE WebViews navigate unexpectedly.

