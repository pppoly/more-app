<template>
  <section class="console-section">
    <header class="section-header">
      <div>
        <h2>{{ isEdit ? 'コミュニティ編集' : 'コミュニティ新規作成' }}</h2>
        <p>基本情報を入力してください。</p>
      </div>
      <RouterLink :to="{ name: 'console-communities' }">一覧へ戻る</RouterLink>
    </header>

    <form class="form" @submit.prevent="handleSubmit">
      <label>
        名称
        <input v-model="form.name" type="text" required />
      </label>

      <label>
        Slug
        <input v-model="form.slug" type="text" :disabled="isEdit" required />
      </label>

      <label>
        ラベル（カンマ区切り）
        <input v-model="form.labels" type="text" placeholder="親子, 多文化" />
      </label>

      <label>
        公開設定
        <select v-model="form.visibleLevel">
          <option value="public">public</option>
          <option value="semi-public">semi-public</option>
          <option value="private">private</option>
        </select>
      </label>

      <label>
        カバー画像URL
        <input v-model="form.coverImageUrl" type="text" placeholder="https://..." />
      </label>

      <label>
        紹介文
        <textarea v-model="form.description" rows="6" placeholder="コミュニティ紹介"></textarea>
      </label>

      <div class="actions">
        <button type="submit" class="primary" :disabled="submitting">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </div>
    </form>

    <p v-if="error" class="status error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createConsoleCommunity, fetchConsoleCommunity, updateConsoleCommunity } from '../../api/client';
import type { ConsoleCommunityDetail } from '../../types/api';

const route = useRoute();
const router = useRouter();
const communityId = computed(() => route.params.communityId as string | undefined);
const isEdit = computed(() => Boolean(communityId.value));

const form = reactive({
  name: '',
  slug: '',
  labels: '',
  visibleLevel: 'public',
  coverImageUrl: '',
  description: '',
});

const submitting = ref(false);
const error = ref<string | null>(null);

const load = async () => {
  if (!communityId.value) return;
  try {
    const data = await fetchConsoleCommunity(communityId.value);
    form.name = data.name;
    form.slug = data.slug;
    form.visibleLevel = data.visibleLevel || 'public';
    form.labels = (data.labels || []).join(', ');
    form.coverImageUrl = data.coverImageUrl || '';
    form.description =
      typeof data.description === 'object' && data.description
        ? String((data.description as ConsoleCommunityDetail['description']).original ?? '')
        : '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '読み込みに失敗しました';
  }
};

const buildDescription = () => ({
  original: form.description,
  lang: 'ja',
  translations: {},
});

const handleSubmit = async () => {
  submitting.value = true;
  error.value = null;
  const payload = {
    name: form.name,
    slug: form.slug,
    labels: form.labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean),
    visibleLevel: form.visibleLevel,
    coverImageUrl: form.coverImageUrl || null,
    description: buildDescription(),
  };
  try {
    if (isEdit.value && communityId.value) {
      await updateConsoleCommunity(communityId.value, payload);
    } else {
      await createConsoleCommunity(payload);
    }
    router.replace({ name: 'console-communities' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  padding: 1.5rem;
  border-radius: 0.75rem;
}

label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  color: #0f172a;
}

input,
textarea,
select {
  margin-top: 0.3rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  font-size: 1rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.primary {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

.status.error {
  color: #b91c1c;
}
</style>
