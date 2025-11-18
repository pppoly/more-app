<template>
  <div class="community-create">
    <header class="create-header">
      <button class="back-button" type="button" @click="router.back()">
        <span class="i-lucide-chevron-left text-lg"></span>
      </button>
      <div>
        <p class="header-label">コミュニティ登録</p>
        <h1>新しいコミュニティ</h1>
      </div>
    </header>

    <main class="create-content">
      <section class="info-card">
        <p>コミュニティ名と基本情報を入力してください。</p>
      </section>

      <section class="form-card">
        <label class="form-field">
          <span>コミュニティ名 <span class="required">*</span></span>
          <input v-model="form.name" type="text" placeholder="創翔コミュニティ" required />
        </label>

        <label class="form-field">
          <span>識別子（slug） <span class="required">*</span></span>
          <input v-model="form.slug" type="text" placeholder="socialmore" required />
          <small>URL に使用されます。例: /communities/<strong>socialmore</strong></small>
        </label>

        <label class="form-field">
          <span>紹介ラベル</span>
          <input v-model="form.labels" type="text" placeholder="親子, 多文化, 教育" />
          <small>カンマ区切りで入力してください。</small>
        </label>

        <label class="form-field">
          <span>公開範囲</span>
          <select v-model="form.visibleLevel">
            <option value="public">Public</option>
            <option value="semi-public">Semi-public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label class="form-field">
          <span>カバー画像 URL</span>
          <input v-model="form.coverImageUrl" type="text" placeholder="https://example.com/banner.jpg" />
        </label>

        <label class="form-field">
          <span>紹介文</span>
          <textarea v-model="form.description" rows="4" placeholder="コミュニティの概要や活動内容を記入してください"></textarea>
        </label>
      </section>

      <p v-if="error" class="form-error">{{ error }}</p>
    </main>

    <footer class="create-footer">
      <Button variant="primary" size="lg" class="w-full justify-center" :disabled="submitting" @click="submit">
        {{ submitting ? '登録中…' : 'コミュニティを作成' }}
      </Button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from '../../../components/ui/Button.vue';
import { createConsoleCommunity } from '../../../api/client';

const router = useRouter();

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

const buildDescription = () => ({
  original: form.description,
  lang: 'ja',
  translations: {},
});

const submit = async () => {
  if (!form.name.trim() || !form.slug.trim()) {
    error.value = 'コミュニティ名と Slug を入力してください';
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    await createConsoleCommunity({
      name: form.name.trim(),
      slug: form.slug.trim(),
      labels: form.labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      visibleLevel: form.visibleLevel,
      coverImageUrl: form.coverImageUrl || null,
      description: buildDescription(),
    });
    router.replace('/console');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登録に失敗しました';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.community-create {
  min-height: 100vh;
  background: var(--m-color-bg, #f5f7fb);
  display: flex;
  flex-direction: column;
}

.create-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px;
  background: #fff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
}

.back-button {
  border: none;
  background: rgba(15, 23, 42, 0.05);
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-label {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.create-header h1 {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--m-color-text-primary);
}

.create-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card,
.form-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--m-color-text-primary);
}

.form-field input,
.form-field textarea,
.form-field select {
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  padding: 10px 12px;
  font-size: 14px;
}

.form-field small {
  font-size: 11px;
  color: var(--m-color-text-tertiary);
}

.required {
  color: #ef4444;
  margin-left: 4px;
}

.form-error {
  margin: 0 16px;
  padding: 12px;
  border-radius: 12px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 13px;
}

.create-footer {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border-top: 1px solid rgba(15, 23, 42, 0.05);
}
</style>
