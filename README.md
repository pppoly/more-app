# more-app

## Stripe 测试环境说明

- 必备环境变量（缺少会禁用 Stripe 功能）：
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`（从 `stripe listen` 输出复制 whsec_...）
  - `STRIPE_ONBOARDING_REFRESH_URL`（用户中断回退地址，测试可用 `http://localhost:5173/console/stripe-return`）
  - `STRIPE_ONBOARDING_RETURN_URL`（成功返回地址，测试可用 `http://localhost:5173/console/stripe-return` 或你的 https 域名）
- 本地启动示例：
  ```bash
  PORT=3000 \
  STRIPE_SECRET_KEY=sk_test_xxx \
  STRIPE_PUBLISHABLE_KEY=pk_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_ONBOARDING_REFRESH_URL=http://localhost:5173/console/stripe-return \
  STRIPE_ONBOARDING_RETURN_URL=http://localhost:5173/console/stripe-return \
  npm run start:dev
  ```
- 获取 webhook secret（测试模式）：
  - 终端运行：`stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook`
  - 监听启动后会打印：`Your webhook signing secret is whsec_...`，复制该值填入 `STRIPE_WEBHOOK_SECRET`

## 文件上传存储

- 环境变量 `UPLOAD_ROOT` 用于指定后端写入与暴露静态文件的根目录，默认值是项目根目录下的 `backend/uploads`。
- 静态资源同时暴露在 `/uploads/**` 与 `/api/v1/uploads/**`，若前端与后端不在同一主机（或仅反向代理 `/api`），请优先访问 `/api/v1/uploads/**`。
- 在云端或容器环境中请将 `UPLOAD_ROOT` 指向挂载的持久化卷（例如 `/data/more-app/uploads`），并确保相同卷被所有副本共享，避免图片/文件因实例重启或扩缩容而丢失。

## 本地开发配置步骤

1. 安装依赖：
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. 复制并填写环境变量：
   - 后端：`cp backend/.env backend/.env.local` 或直接修改 `backend/.env`，确保 PostgreSQL `DATABASE_URL`、Stripe、OpenAI、LINE 等字段已经替换为有效值。
   - 前端：编辑 `frontend/.env.local`，设置 `VITE_API_BASE_URL`（通常指向后端 `http://localhost:3000/api/v1`）以及 `VITE_GOOGLE_MAPS_API_KEY`（若要启用地图选点）。
3. 启动本地 PostgreSQL（若你没有现成的数据库）：
   ```bash
   docker compose up postgres -d   # 首次会自动创建数据卷 pgdata
   ```
4. 初始化数据库：
   ```bash
   cd backend
   npx prisma migrate deploy   # 或 npx prisma migrate dev
   npm run prisma:seed         # 如需示例数据
   ```
5. 启动服务：
   ```bash
   # 终端 1：后端
   cd backend
   npm run start:dev

   # 终端 2：前端
   cd frontend
   npm run dev
   ```
6. Stripe Webhook（如需测试支付结果）：
   ```bash
   stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook
   ```
