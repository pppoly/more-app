# Stripe テスト確認の手順（簡易版）

1) **環境変数を確認（テストキー）**
   - `STRIPE_SECRET_KEY`（テスト用）
   - `STRIPE_PUBLISHABLE_KEY`（テスト用）
   - `STRIPE_WEBHOOK_SECRET`（後述の `stripe listen` で取得）
   - `FRONTEND_BASE_URL`（支払い完了後のリダイレクト先）

2) **コミュニティが Stripe 連携済みか確認**
   - 対象コミュニティに `stripeAccountId` があること（テストモードのアカウント）。

3) **Webhook をローカル/テスト機で起動**
   ```bash
   stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook
   ```
   - 表示される `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定。
   - テスト機で動かす場合は、`localhost` を実ホストに置き換え、必要なら ngrok などで公開。

4) **テスト支払いを実行**
   - 有料イベントで申込を作成（registration）。
   - 支払い開始時、バックエンドの `createStripeCheckout` で得た `checkoutUrl` をブラウザで開く。
   - テストカード `4242 4242 4242 4242`（任意有効期限/ CVC）で支払い。

5) **確認ポイント**
   - Stripe Dashboard でイベントを確認：`checkout.session.completed`/`payment_intent.succeeded` が届いているか。
   - アプリ側：`Payment.status` / `registration.paymentStatus` が `paid` に更新されること。
   - Platform fee: 社群の `pricingPlanId` に応じて `application_fee_amount` が Free=5%、Starter=2%、Pro=0%（metadata も確認）。

6) **トラブルシュート**
   - 支払い後も pending: Webhook が届いていない可能性 → `stripe listen` / `STRIPE_WEBHOOK_SECRET` を再確認。
   - application_fee_amount が 0: コミュニティに `pricingPlanId` が無い or Pro になっているかを確認。
   - ログを確認：`backend/src/payments/payments.service.ts` の webhook ログ出力。

テストが通れば本番でも同様に、ただし本番キー・本番 webhook に切り替えて実施してください。
