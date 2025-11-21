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
