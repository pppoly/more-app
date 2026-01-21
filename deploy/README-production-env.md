# Production env / Docker Compose 生效链路（建议）

这份文档的目标是把 production 从“假变量能跑”升级成“变量完整、可验收上线”：
- **后端**：运行时读取 `process.env.*`，Docker Compose `env_file/environment` 生效即可。
- **前端（Vite）**：默认是 **build-time** 把 `import.meta.env.VITE_*` 直接打进 bundle；只改容器运行时 env 通常不会生效。

## 1) 一键审计：代码实际读了哪些 env + 你的 .env.production 是否缺漏

在仓库根目录运行：

```bash
node scripts/env-audit.mjs --env-file /absolute/path/to/.env.production --out deploy/env-audit.report.md
```

输出：
- `deploy/env-audit.report.md`：包含 backend/frontend 的 env 读取表（不打印值，只判断 key 是否存在）
- `.logs/env-map.json`：env→文件引用次数映射（用于深入排查）

## 1.1 仓库内提供的 production 示例（可直接落地）

> 当前仓库根目录的 `docker-compose.yml` 仅用于本地 Postgres，不是 production compose。

- `deploy/docker-compose.prod.example.yml`：示例 production compose（后端 runtime env + 前端 build args）
- `deploy/env.production.example`：最小可用 env 清单模板（无真实 secrets）
- `backend/Dockerfile`：NestJS/Prisma 构建与运行镜像
- `frontend/Dockerfile`：Vite build（含 LIFF）+ Nginx 静态托管
- `frontend/nginx.conf`：SPA history mode 的 `try_files` 配置

## 2) 已知高风险点（和代码位置）

### LINE_REDIRECT_URI 末尾误带 “.”
- 风险：LINE Developers Console 里登记的 Callback URL 不匹配，导致回调失败。
- 修复（最小改动）：修 `.env.production` 的 `LINE_REDIRECT_URI`，去掉末尾的 `.`。
- 防呆（代码层）：后端会对 `LINE_REDIRECT_URI` 做 trim/sanitize，见 `backend/src/auth/line.config.ts`。

### STRIPE_API_VERSION 必须显式设置（prod/uat）
- 代码读取：`backend/src/stripe/stripe-config.ts`
- 行为：在 `APP_ENV=production/uat` 下，如果缺失会导致 Stripe 相关服务启动时报错（避免误用“默认 API version”）。
- 建议：在 `.env.production` 显式写入 `STRIPE_API_VERSION`，并确保与 Stripe Dashboard 对应 webhook endpoint 的 API version 一致。
  - 仓库内脚本默认值是 `2025-12-15.preview`（仅供参考，不代表你的 Dashboard 一定是这个版本）。

### Stripe LIVE/TEST key 命名与生效（避免 prod 误用 test key）
- 代码读取：`backend/src/stripe/stripe-config.ts`
- 规则（本仓库当前策略）：
  - `APP_ENV=production/prod/live`：只读取 `STRIPE_*_LIVE`
  - `APP_ENV=uat/staging/test`：只读取 `STRIPE_*_TEST`
  - `APP_ENV=dev/local`：允许读取无后缀 `STRIPE_*`（本地开发用）

### 前端 VITE_* 变量不生效（最常见误区）
如果 production 的前端镜像是“build once 的静态资源”，那么：
- 你改了 `.env.production` → **容器里 env 变了**
- 但前端 bundle 里 `VITE_API_BASE_URL` 仍然是 **旧值**（或 `undefined`）

正确做法二选一：

**方案 A（推荐，简单）**：build-time 注入（Docker build args）
- Dockerfile build 阶段把 `VITE_*` 作为 `ARG`/`ENV`，然后执行 `npm run build`。
- compose 通过 `--env-file .env.production` 提供插值来源，并把 `build.args` 显式列出 `VITE_*`。

**方案 B（更灵活）**：runtime 注入（entrypoint 生成 `env.js`）
- 容器启动时把 env 写到一个静态 `env.js`，前端从 `window.__ENV__` 读取。
- 优点：改 env 不必重建镜像；缺点：需要改前端代码读取逻辑。

## 3) Docker Compose 链路自检（你可以在生产机直接跑）

> 关键点：`env_file:` 只影响容器运行时；**build-time** 变量需要 `--env-file` + `build.args`。

### 3.1 展开最终 compose 配置（确认插值是否来自你的 .env.production）
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config > /tmp/compose.rendered.yml
rg -n "VITE_|STRIPE_|LINE_|FRONTEND_" /tmp/compose.rendered.yml
```

### 3.2 在容器内验证关键变量“真的存在”（不建议输出敏感值）
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend node -e 'console.log({APP_ENV:process.env.APP_ENV,NODE_ENV:process.env.NODE_ENV,STRIPE_API_VERSION:!!process.env.STRIPE_API_VERSION,LINE_REDIRECT_URI:!!process.env.LINE_REDIRECT_URI})'
```

前端如果是静态资源镜像，验证 `VITE_*` 是否生效的方式是：
- 直接打开页面，查看浏览器 console 是否报 `VITE_API_BASE_URL must be defined...`
- 或在构建日志中打印（build 阶段）`VITE_API_BASE_URL`（注意不要把敏感信息打日志）

## 4) 最少部署步骤（建议）

1) 修改 `.env.production`
2) 确认 `APP_ENV=production`（或 `NODE_ENV=production`）在 compose 里显式设置
3) 运行：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

4) 验收：
- 后端 health：`curl -fsS https://app.socialmore.jp/api/v1/health || echo FAIL`
- Stripe webhook：在 Stripe Dashboard 发送 test event，后端日志不应出现 `Invalid Stripe signature`

## 5) production 最小必填 env（建议清单）

### Backend（必须）
- `APP_ENV=production`
- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_ORIGINS`

### Backend（按功能启用）
- LINE 登录：`LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_REDIRECT_URI`
- Stripe LIVE：`STRIPE_API_VERSION`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_PUBLISHABLE_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`
- Stripe onboarding：`STRIPE_ONBOARDING_REFRESH_URL`, `STRIPE_ONBOARDING_RETURN_URL`

### Frontend（必须，Vite build-time）
- `VITE_API_BASE_URL`

### Frontend（按功能启用）
- LIFF：`VITE_APP_TARGET=liff`, `VITE_LIFF_ID`, `VITE_LINE_CHANNEL_ID`
