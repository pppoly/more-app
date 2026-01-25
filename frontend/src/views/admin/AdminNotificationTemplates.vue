<template>
  <main class="admin-templates">
    <header class="page-head">
      <div>
        <p class="eyebrow">通知設定</p>
        <h1>メールテンプレート</h1>
        <p class="subhead">参加者/主催者向けの必須通知を管理します。</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!templates.length" class="empty">テンプレートがありません。</div>
      <div v-else class="card-list">
        <article v-for="item in templates" :key="item.type" class="template-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.label }}</p>
              <h3>{{ item.type }}</h3>
              <p class="meta">{{ item.description || '—' }}</p>
            </div>
            <div class="status">
              <span class="pill" :class="item.enabled ? 'pill-on' : 'pill-off'">
                {{ item.enabled ? '有効' : '無効' }}
              </span>
              <span class="pill pill-muted">{{ item.overridden ? 'override' : 'default' }}</span>
            </div>
          </div>

          <div class="meta-row">
            <span class="meta-label">role</span>
            <span class="meta-value">{{ item.role }}</span>
            <span class="meta-label">category</span>
            <span class="meta-value">{{ item.category }}</span>
            <span class="meta-label">channel</span>
            <span class="meta-value">
              <span v-if="item.channels.email" class="chip">email</span>
              <span v-if="item.channels.line" class="chip">line</span>
            </span>
          </div>

          <div class="actions">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="item.enabled"
                :disabled="updating[item.type]"
                @change="toggleTemplate(item)"
              />
              <span>{{ updating[item.type] ? '更新中…' : item.enabled ? '有効' : '無効' }}</span>
            </label>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminNotificationTemplate } from '../../types/api';
import { fetchAdminNotificationTemplates, updateAdminNotificationTemplate } from '../../api/client';

const templates = ref<AdminNotificationTemplate[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const updating = ref<Record<string, boolean>>({});

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    templates.value = await fetchAdminNotificationTemplates();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

const toggleTemplate = async (item: AdminNotificationTemplate) => {
  updating.value[item.type] = true;
  try {
    const updated = await updateAdminNotificationTemplate(item.type, !item.enabled);
    const index = templates.value.findIndex((entry) => entry.type === item.type);
    if (index !== -1) templates.value[index] = updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新に失敗しました';
    window.alert(message);
  } finally {
    updating.value[item.type] = false;
  }
};

onMounted(load);
</script>

<style scoped>
.admin-templates {
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
.template-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.meta {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}
.status {
  display: flex;
  gap: 6px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.pill-on {
  background: #dcfce7;
  color: #166534;
}
.pill-off {
  background: #fee2e2;
  color: #991b1b;
}
.pill-muted {
  background: #e2e8f0;
  color: #475569;
}
.meta-row {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto 1fr;
  gap: 6px 10px;
  font-size: 12px;
  color: #475569;
}
.meta-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
}
.meta-value {
  color: #0f172a;
}
.chip {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 11px;
  margin-right: 6px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
}
@media (max-width: 720px) {
  .meta-row {
    grid-template-columns: auto 1fr;
  }
}
</style>
