<template>
  <main class="admin-resources">
    <header class="page-head">
      <div>
        <p class="eyebrow">资源配置</p>
        <h1>アセット管理</h1>
        <p class="subhead">Logo / 图标 / 占位图</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!groups.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="group in groups" :key="group.id" class="resource-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ group.id }}</p>
              <h3>{{ group.name }}</h3>
            </div>
            <span class="pill pill-info">{{ group.items?.length ?? 0 }} 項目</span>
          </div>
          <p class="meta">{{ group.description || '—' }}</p>
          <div class="actions">
            <button class="ghost" type="button" @click="openGroup(group.id)">詳細</button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchResourceGroups } from '../../api/client';
import type { ResourceGroup } from '../../types/api';

const router = useRouter();
const loading = ref(false);
const error = ref<string | null>(null);
const groups = ref<ResourceGroup[]>([]);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    groups.value = await fetchResourceGroups();
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const openGroup = (id: string) => {
  router.push({ name: 'admin-resource-group', params: { groupId: id } });
};

onMounted(load);
</script>

<style scoped>
.admin-resources {
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
.resource-card {
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
.pill-info {
  background: #eef2ff;
  color: #312e81;
}
</style>
