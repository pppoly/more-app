<template>
  <main class="admin-ai-prompts">
    <header class="page-head">
      <div>
        <p class="eyebrow">Prompt 管理</p>
        <h1>Prompt 一覧</h1>
        <p class="subhead">編集 / 発布 状態を確認</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!items.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="item in items" :key="item.id" class="prompt-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ getModuleId(item.id) }}</p>
              <h3>{{ item.name || item.id }}</h3>
            </div>
            <span class="pill" :class="isPublished(item) ? 'pill-live' : 'pill-pending'">
              {{ isPublished(item) ? 'Published' : 'Draft' }}
            </span>
          </div>
          <p class="meta">ID: {{ item.id }}</p>
          <p class="meta">version: {{ item.version || '—' }}</p>
          <p v-if="item.approvedAt" class="meta">approved: {{ formatDate(item.approvedAt) }}</p>
          <div class="actions">
            <button class="ghost" type="button" @click="openPrompt(item.id)">詳細</button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PromptDefinition } from '../../types/api';
import { fetchAdminPrompts } from '../../api/client';
import { useRouter } from 'vue-router';

const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<PromptDefinition[]>([]);
const router = useRouter();

const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const getModuleId = (promptId: string) => promptId.split('.')[0] || promptId;
const isPublished = (prompt: PromptDefinition) => prompt.status === 'published';

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    items.value = await fetchAdminPrompts();
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const openPrompt = (id: string) => {
  router.push({ name: 'admin-ai-console', query: { promptId: id } });
};

onMounted(load);
</script>

<style scoped>
.admin-ai-prompts {
  min-height: 100vh;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.eyebrow {
  font-size: 12px;
  color: #475569;
  letter-spacing: 0.08em;
}
.page-head h1 {
  margin: 4px 0;
}
.subhead {
  margin: 0;
  color: #475569;
}
.ghost {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}
.empty {
  padding: 18px;
  color: #475569;
}
.empty.error {
  color: #b91c1c;
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.prompt-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.meta {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.pill-live {
  background: #ecfdf3;
  color: #15803d;
}
.pill-pending {
  background: #fff7ed;
  color: #c2410c;
}
</style>
