<template>
  <div class="community-settings">
    <header class="settings-head">
      <p class="eyebrow">社群設定</p>
      <h1>{{ form.name || 'コミュニティ' }}</h1>
      <p class="hint">社群介紹與標籤會顯示在公開頁面與 AI 助手的歡迎語中。</p>
    </header>

    <section class="card">
      <label class="field">
        <span>社群名稱</span>
        <input type="text" v-model="form.name" placeholder="コミュニティ名" disabled />
      </label>
      <label class="field">
        <span>社群介紹</span>
        <textarea
          rows="8"
          v-model="form.description"
          placeholder="コミュニティの目的や活動内容、歓迎する人などを入力してください。"
        />
        <small>該内容會同步給多語言版本與活動助手。</small>
      </label>
      <label class="field">
        <span>標籤（用逗號分隔）</span>
        <input type="text" v-model="form.labelsText" placeholder="community, collaboration, npo" />
      </label>
      <label class="field">
        <span>公開設定</span>
        <select v-model="form.visibleLevel">
          <option value="public">公開（誰でも閲覧可）</option>
          <option value="members">メンバー限定</option>
          <option value="private">非公開</option>
        </select>
      </label>
    </section>

    <div class="actions">
      <button type="button" class="ghost" :disabled="saving" @click="router.back()">戻る</button>
      <button type="button" class="primary" :disabled="saving" @click="saveChanges">
        {{ saving ? '保存中...' : '保存する' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchConsoleCommunity, updateConsoleCommunity } from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';

const route = useRoute();
const router = useRouter();
const communityId = route.params.communityId as string;

const loading = ref(false);
const saving = ref(false);
const originalData = ref<ConsoleCommunityDetail | null>(null);

const form = reactive({
  name: '',
  description: '',
  labelsText: '',
  visibleLevel: 'public',
});

const normalizeDescription = (text: string) => text.trim();

const loadCommunity = async () => {
  if (!communityId) return;
  loading.value = true;
  try {
    const detail = await fetchConsoleCommunity(communityId);
    originalData.value = detail;
    form.name = detail.name;
    form.description = getLocalizedText(detail.description);
    form.labelsText = detail.labels?.join(', ') ?? '';
    form.visibleLevel = detail.visibleLevel ?? 'public';
  } finally {
    loading.value = false;
  }
};

const saveChanges = async () => {
  if (!communityId || !originalData.value) return;
  saving.value = true;
  try {
    const baseDescription = normalizeDescription(form.description);
    const payload = {
      description: {
        ja: baseDescription,
        zh: baseDescription,
        en: baseDescription,
      },
      labels: form.labelsText
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      visibleLevel: form.visibleLevel,
    };
    await updateConsoleCommunity(communityId, payload);
    await loadCommunity();
    alert('社群情報を更新しました。');
  } catch (error) {
    console.error('Failed to update community', error);
    alert('社群情報の更新に失敗しました。');
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadCommunity();
});
</script>

<style scoped>
.community-settings {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: #f5f7fb;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #94a3b8;
}
.settings-head h1 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #475569;
}
.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #1f2937;
}
.field span {
  font-weight: 600;
  color: #0f172a;
}
.field input,
.field textarea,
.field select {
  border-radius: 14px;
  border: 1px solid #d7e0ef;
  padding: 10px 12px;
  font-size: 14px;
  color: #0f172a;
  background: #fff;
}
.field textarea {
  resize: vertical;
}
.field small {
  color: #64748b;
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 10px;
}
.ghost,
.primary {
  flex: 1;
  border-radius: 18px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  border: none;
}
.ghost {
  background: #e2e8f0;
  color: #1f2937;
}
.primary {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
}
</style>
