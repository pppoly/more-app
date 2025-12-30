<template>
  <main class="console-home">
    <section class="hero-card">
      <div class="hero-head">
        <div class="identity">
          <span class="avatar-pill">{{ ownerInitials }}</span>
          <div>
            <p class="eyebrow">あなたのコミュニティ</p>
            <h1>{{ communityName }}</h1>
            <p class="status-line">
              <span class="status-dot"></span>
              {{ communityStatus }}
            </p>
          </div>
        </div>
        <div class="hero-kpi">
          <p class="kpi-label">今週の申込</p>
          <p class="kpi-value">{{ kpiSignups }}</p>
          <p class="kpi-note">「{{ nextActionHint }}」で次へ進めます</p>
        </div>
      </div>
      <div class="hero-grid">
        <div class="hero-metric">
          <p class="metric-label">公開準備度</p>
          <p class="metric-value">{{ readiness }} / 100</p>
          <p class="metric-hint">基本情報を埋めるとすぐ公開できます</p>
        </div>
        <div class="hero-metric">
          <p class="metric-label">メンバー招待</p>
          <p class="metric-value">{{ invitedCount }} 名</p>
          <p class="metric-hint">コアメンバーに最新イベントを共有しましょう</p>
        </div>
        <div class="hero-metric ghost-link">
          コミュニティページへ
        </div>
      </div>
    </section>

    <section class="quick-section">
      <div class="quick-row">
        <button class="quick-btn" type="button">新しいイベントを作る</button>
        <button class="quick-btn" type="button">AI アシスタントに相談</button>
        <button class="quick-btn" type="button">チェックリストを確認</button>
      </div>
      <div class="current-task">
        <p class="task-label">現在のタスク</p>
        <p class="task-text">「{{ nextActionHint }}」から始めると 5 分で下書きが完成します。</p>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel">
        <header class="panel-head">
          <div>
            <p class="eyebrow">最近のイベント</p>
            <h3>まだイベントはありません</h3>
          </div>
        </header>
        <div class="empty-state">
          <p class="empty-title">最初のイベントを告知しましょう</p>
          <p class="empty-desc">テーマと日程を決めれば、AI が説明文とチェックリストを用意します。</p>
        </div>
      </article>

      <article class="panel ai-panel">
        <header class="panel-head">
          <div>
            <p class="eyebrow">AI からのヒント</p>
            <h3>迷ったら一言で相談</h3>
          </div>
        </header>
        <div class="ai-hint">
          <p class="ai-text">「次回イベントのターゲットは学生、カジュアルにしたい」と送るだけで、募集文・タイムライン・持ち物リストを返します。</p>
          <p class="ai-subtext">質問は 1 つずつ。AI が次の質問を投げてくれるので、迷わず進めます。</p>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const communityName = 'SOCIALMORE コミュニティ';
const communityStatus = '立ち上げ中 · 下書き保存済み';
const ownerInitials = 'SM';
const readiness = 68;
const invitedCount = 12;
const kpiSignups = 8;
const nextActionHint = computed(() => '次のイベントのタイトルと日程を決める');
</script>

<style scoped>
.console-home {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f8fafc;
}

.hero-card {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: #f8fafc;
  border-radius: 0;
  margin: -20px -20px 0;
  padding: 22px 20px 18px;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.identity {
  display: flex;
  gap: 12px;
}

.avatar-pill {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #fff;
  font-size: 16px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}

.hero-head h1 {
  margin: 4px 0 6px;
  font-size: 22px;
  font-weight: 800;
}

.status-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  opacity: 0.9;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.2);
}

.hero-kpi {
  min-width: 180px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  text-align: right;
}

.kpi-label {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.kpi-value {
  margin: 6px 0 4px;
  font-size: 28px;
  font-weight: 800;
}

.kpi-note {
  margin: 0;
  font-size: 13px;
  opacity: 0.92;
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.hero-metric {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f8fafc;
}

.metric-label {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.metric-value {
  margin: 6px 0 4px;
  font-size: 18px;
  font-weight: 800;
}

.metric-hint {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}

.ghost-link {
  opacity: 0.72;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.quick-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.quick-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  font-weight: 700;
  color: #0f172a;
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.current-task {
  padding: 10px 12px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
}

.task-label {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}

.task-text {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.5;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-head h3 {
  margin: 4px 0 0;
  font-size: 18px;
  color: #0f172a;
}

.empty-state {
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}

.empty-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.ai-panel {
  background: linear-gradient(135deg, #f8fafc, #eef2ff);
  border-color: #e0e7ff;
}

.ai-hint {
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-text {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.6;
}

.ai-subtext {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
</style>
