# Stripe Connect 资金模型迁移评估（platform charge + 平台退款 + 延迟结算）

## 1) 改动摘要

### 数据层（Prisma + migration）
- `backend/prisma/schema.prisma`
  - `Payment.chargeModel` 新增枚举字段（**无 DB 默认值**，由代码创建时显式写入），用于兼容旧模型与回滚通道。
  - 新增枚举 `ChargeModel`：`platform_charge | destination_charge`。
  - Webhook durable store + 幂等真源：`PaymentGatewayEvent(provider, providerEventId)`（`payload jsonb` + 唯一键）。
  - `EventInbox` 表仍保留在 schema 内（历史迁移兼容），但 Stripe webhook 幂等/重试已收敛到 `PaymentGatewayEvent`（避免双表竞态）。
  - 新增结算表：
    - `SettlementBatch(periodFrom, periodTo, status, runAt, meta, currency)`
    - `SettlementItem(batchId, hostId, hostBalance, settleAmount, carryReceivable, counts, status, stripeTransferId, errorMessage)`
  - `Community.settlementItems` 作为 `SettlementItem.host` 的反向关系字段（满足 Prisma relation 约束）。
- `backend/prisma/migrations/20260210_platform_charge_and_settlement/migration.sql`
  - 新增 `ChargeModel` enum 类型与 `Payment.chargeModel` 列（默认 `platform_charge`）。
  - 新增 `EventInbox`、`SettlementBatch`、`SettlementItem` 相关表/索引/FK。
- `backend/prisma/migrations/20260211_charge_model_backfill/migration.sql`
  - `Payment.chargeModel` **DROP DEFAULT**（避免误标历史 destination charge）。
  - 对已有 Payment 做 backfill：存在 `stripeTransferId/stripeFeeReversalId` 或 `LedgerEntry(entryType in transfer/transfer_reversal)` 的，标记为 `destination_charge`。
- `backend/prisma/migrations/20260212_settlement_batch_unique/migration.sql`
  - 清理 dev/staging 中重复的 settlement batch（同 periodFrom/periodTo/currency 保留最新）。
  - 增加 `SettlementBatch(periodFrom, periodTo, currency)` 唯一约束（防止重复跑批）。
- `backend/prisma/migrations/20260213_payment_gateway_event_retry_fields/migration.sql`
  - `PaymentGatewayEvent` 新增 `nextAttemptAt/updatedAt` 与索引，用于 webhook claim + 内部重试调度。

### 支付/退款/对账核心（收敛到 payments 模块）
- `backend/src/payments/payments.config.ts`
  - 新增 feature flags：
    - `PAYMENT_CHARGE_MODEL`（默认 `platform_charge`，保留 `destination_charge` 回滚分支）
    - `SETTLEMENT_ENABLED`（默认 `false`）
    - `SETTLEMENT_REPORT_DIR`（默认 `.logs/settlement`）
    - `SETTLEMENT_RETRY_INTERVAL_MS`
  - 新增 `resetPaymentsConfigForTest()`（仅用于自测时重置缓存）。
- `backend/src/payments/payments.service.ts`
  - `createStripeCheckout(...)`：
    - 默认创建 **platform charge**：不再设置 `transfer_data.destination` / `application_fee_amount`。
    - destination charge 逻辑保留在 `chargeModel === 'destination_charge'` 分支（回滚通道）。
    - Stripe 写入均带 `idempotencyKey`（Checkout session create / expire / refund / transfer reversal 等）。
  - `refundStripePaymentWithMerchantFee(...)`：
    - `chargeModel === 'platform_charge'` 时：仅 `stripe.refunds.create({payment_intent, amount})`，不再使用 `reverse_transfer` / `refund_application_fee`，不再创建 `transfer reversal`。
    - `chargeModel === 'destination_charge'` 时保留旧参数（回滚通道）。
    - platform charge 退款落内部台账：`platform_fee_reversal` / `host_payable_reversal` / `refund_fee_loss_platform`（v1：平台承担退款手续费损失）。
  - `reconcilePaymentSettlement(...)`：
    - platform charge：仅对齐 `latest_charge.balance_transaction`，落 `stripe_fee_actual` + 内部 `platform_fee`/`host_payable` journal；不创建 transfer/reversal。
    - destination charge：保留旧 transfer + fee allocation（回滚通道）。
  - `handleStripeWebhook(...)`：
    - durable ACK：先 upsert `PaymentGatewayEvent(provider, providerEventId).payload`；落盘失败抛错（HTTP 500 → Stripe 自动重试）。
    - 幂等单一真源：仅以 `PaymentGatewayEvent.processedAt/status/nextAttemptAt` 做 claim + 状态推进（不再依赖 `EventInbox`）。
    - 业务处理失败也 ACK 200（事件已 durable），并通过 `PaymentGatewayEvent.nextAttemptAt` 内部重试扫表。
    - `processGatewayEventById(gatewayEventId)`：从 DB 读 payload 再处理，避免“传参 event 对象”分叉。
    - `retryOverdueStripeWebhookEvents(...)`：从 `PaymentGatewayEvent` 拉 due events（读 payload 重算）。
- `backend/src/payments/webhook-retry.service.ts`
  - 新增定时重试（默认关闭）：`STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS>0` 才启用。

### 延迟结算跑批
- `backend/src/payments/settlement.service.ts`
  - `runSettlementBatch({periodFrom, periodTo})`：
    - 计算 `host_net_position`（基于 Ledger 聚合：`host_payable - host_payable_reversal`，并扣减历史已结算额）。
    - 写入 `SettlementBatch/SettlementItem`。
    - `SETTLEMENT_ENABLED=false`：仅生成 batch/items 与报表，不调用 Stripe transfer（`status=dry_run`）。
    - `SETTLEMENT_ENABLED=true`：仅对净正数创建 Transfer（正向 transfer），失败不影响主流程，批次可 `retrySettlementBatch(batchId)` 重试。
    - 输出报表到 `SETTLEMENT_REPORT_DIR`：
      - `summary.json` / `items.csv`（同时写入带 batchId 的副本）。
    - 并发护栏：Transfer 前先 claim `SettlementItem`（`pending/failed/dry_run -> processing` 且 `stripeTransferId IS NULL`），避免重复转账。

### 自测（node:test）
- `backend/tests/payments-platform-charge.test.ts`：覆盖 P1~P4、R1~R5（使用 Stripe/Prisma in-memory stub）。
- `backend/tests/settlement.test.ts`：覆盖 S1~S4（dry-run / transfer fail / retry）。
- `backend/tests/payments-test-helpers.ts`：测试用 in-memory Prisma/Stripe stubs。

## 2) 风险评估与护栏

### 主要回归风险
- **支付模型切换**：destination charge → platform charge，会改变 Stripe 上资金落点与 fee 归属。
- **退款路径切换**：不再依赖 `reverse_transfer`/`refund_application_fee`，避免子账户负余额，但需要业务账本正确表达主办方负头寸（`host_receivable` 以结算负余额结转形式体现）。
- **Webhook 乱序/重放**：Stripe 事件可能先到 refund 再到 payment 或重复投递，必须保证不重复记账、且能重试。
- **结算跑批失败**：平台余额不足、Stripe 限流/异常，必须隔离，不影响支付/退款主流程。

### 护栏（v1 约束对应）
- `Payment.chargeModel`：每笔 Payment 固化资金模型；新创建默认 `platform_charge`；保留 `destination_charge` 仅作回滚通道。
- `PaymentGatewayEvent(provider, providerEventId)`：Webhook durable store + 幂等真源（status/processedAt/nextAttemptAt/attempts）。
- Stripe 写入 `idempotency_key`：Checkout/Refund/Transfer 均启用（避免重试重复创建）。
- `SETTLEMENT_ENABLED=false` 默认：先生成报表与 batch/items，不实际转账，便于灰度。
- settlement 仅做 **正向 Transfer**：不做 transfer reversal，避免 connected account 负可用余额。
- settlement 并发 claim：Transfer 前 DB 层 claim item，避免重复转账（即使 Stripe 幂等 key 失效也能兜底）。

## 3) 自测结果（本地可复现）

### 命令
- Prisma client：`cd backend && npm run prisma:generate`
- Backend build：`cd backend && npm run build`
- Frontend build：`cd frontend && npm run build`
- 自测（P/R/S）：`cd backend && node --test -r ts-node/register tests/payments-platform-charge.test.ts tests/settlement.test.ts`
- 既有测试：`cd backend && npm run test:payout-policy`
- chargeModel backfill 后置校验：`cd backend && ts-node scripts/verify-charge-model-backfill.ts`（需要 `DATABASE_URL`）

### 覆盖映射（全部通过）
- **[支付 P]**
  - P1：platform charge 支付成功（checkout.session.completed）→ Payment=paid → ledger 不重复
  - P2：payment_intent.payment_failed → Payment=failed
  - P3：checkout.session.expired → Payment=cancelled
  - P4：同一 webhook 重放 3 次 → ledger 不重复（PaymentGatewayEvent.processedAt + claim）
- **[退款 R]**
  - R1：全额退款：Refund 由 platform 发起（无 reverse flags），落 `refund_fee_loss_platform`
  - R2/R3：部分退款多次累计至全额：状态/累计正确、refund id 幂等
  - R4：refund webhook 先到（Payment 不存在）→ `PaymentGatewayEvent.status=failed + nextAttemptAt` → retry 后最终一致
  - R5：重复 refund event → 不重复落账
- **[结算 S]**
  - S1：单 host 多笔支付+退款聚合 → settle_amount 计算正确（dry-run）
  - S2：hostBalance<0 → settle_amount=0、carry_receivable>0
  - S3：`SETTLEMENT_ENABLED=false` → 仅生成 batch/items/report，不调用 transfer
  - S4：`SETTLEMENT_ENABLED=true` 且 transfer 失败 → 批次失败可 retry，且失败隔离
  - S4(并发)：并发触发 `retrySettlementBatch` → claim 生效，仅创建一次 transfer

## 4) Stripe 测试模式验证

仓库内自测默认使用 **in-memory Stripe stub**（不依赖真实 Stripe key）。同时新增一个可选的 Stripe testmode smoke 脚本用于上线前人工验证参数组合与 fee 行为。

### 运行（手动，不进 CI）
- 脚本：`cd backend && ts-node scripts/stripe_testmode_smoke.ts`
- 环境变量（缺一即 skip）：
  - `STRIPE_SECRET_KEY`：Stripe testmode secret key
  - `STRIPE_WEBHOOK_SECRET`：本地 webhook secret（脚本仅用于 gate；后续可扩展为签名回放）
  - `BASE_URL`：本地可访问 base url（用于 success/cancel url）
  - 可选：`DATABASE_URL`（存在则额外跑一次 settlement dry-run 并输出报表到 `./.logs/stripe-e2e/settlement/`）
- 输出目录：`./.logs/stripe-e2e/`
- 断言点：`fee > 0` 且 `net(charge) + net(refund) === -fee`（退款不退 processing fee）

## 5) 迁移说明与回滚方案

### 为什么无历史交易时一次性切换风险最低
- 无需处理历史 destination charge 的批量对账与迁移。
- 不存在已结算/已对外出账的主办方余额，避免迁移时出现负头寸争议。
- 可以把 `Payment.chargeModel` 固化在 v1 规则上，未来再扩展策略开关。

### 回滚（灰度回滚通道）
- 关闭结算：`SETTLEMENT_ENABLED=false`
- 临时回退新支付模型：`PAYMENT_CHARGE_MODEL=destination_charge`（仅对新创建 Payment 生效；既有 Payment 仍以 `chargeModel` 为准）
- Webhook 重试可关闭：`STRIPE_WEBHOOK_RETRY_SWEEP_INTERVAL_MS=0`

## 6) 下一步建议

- 增加一个受限的管理入口/脚本用于：
  - 触发 `SettlementService.runSettlementBatch`、`retrySettlementBatch`
  - 查看 `PaymentGatewayEvent` webhook 重试队列与失败原因（`status/attempts/nextAttemptAt/errorMessage`）
- 增加监控/日志字段（最小必要）：
  - `paymentId, chargeId, refundId, transferId, hostId, chargeModel, settlementBatchId`
- 在上线前补真实 Stripe testmode 的 e2e（含 webhook 乱序回放）。
- `backend/src/admin/admin-stats.controller.ts`：已修复 req 类型导致的 eslint 报错（`npm run lint` 可通过）。

## 7) Release Gate Checklist

- [x] (1) `chargeModel` 默认值/回填修正：DB drop default + backfill + 校验脚本 `backend/scripts/verify-charge-model-backfill.ts`
- [x] (2) Settlement 口径改为 Ledger 聚合：`backend/src/payments/settlement.service.ts` + `backend/tests/settlement.test.ts`
- [x] (3) Webhook ACK durable + 幂等真源：`PaymentGatewayEvent(provider, providerEventId)` claim + retry；自测见 `backend/tests/payments-platform-charge.test.ts`
- [x] (4) Stripe testmode e2e 脚本：`backend/scripts/stripe_testmode_smoke.ts`（非 CI）
- [x] (5) Settlement Transfer 幂等 + claim：batch 唯一约束 + item claim + 并发自测
- [x] (6) CI 可通过：`cd backend && npm run lint && npm run build`、`cd frontend && npm run build`（见上）
