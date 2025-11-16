<template>
  <section class="admin-home">
    <header>
      <h2>プラットフォーム管理</h2>
      <p>主理人申請のレビューや全体状況の確認を行う管理者ページです。</p>
    </header>
    <div class="card">
      <p>このページは管理者のみがアクセスできます。後続の開発で詳細機能を追加予定です。</p>
    </div>
  </section>
</template>

<script setup lang="ts"></script>

<style scoped>
.admin-home {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
}
</style>
