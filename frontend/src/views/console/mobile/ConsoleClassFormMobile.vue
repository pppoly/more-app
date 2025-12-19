<template>
  <div class="class-form">
    <ConsoleTopBar v-if="showTopBar" :title="isEdit ? '教室を編集' : '教室を作成'" @back="goBack" />
    <div class="info-banner">
      <p class="info-text">教室は長期のコースです。作成後に、上課の日程（回次）を追加します</p>
    </div>
    <form @submit.prevent="handleSubmit" class="form">
      <div v-if="loading" class="skeleton">
        <div class="sk-line title"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
      </div>
      <div v-else>
      <section class="group">
        <p class="group-title">教室基本情報</p>
        <label class="field">
          <span>タイトル *</span>
          <input
            v-model="form.title"
            type="text"
            required
            placeholder="例：にほんごきょうしつ【しょしんしゃむけ】"
          />
          <p class="hint">参加者に表示される教室名です</p>
        </label>
        <label class="field">
          <span>説明</span>
          <textarea
            v-model="form.description"
            rows="2"
            placeholder="例：買い物の会話や電話のかけ方など、生活に役立つ日本語を学びます。"
          ></textarea>
        </label>
        <label class="field">
          <span>場所</span>
          <input v-model="form.locationName" type="text" placeholder="例：MISHOP 第1会議室" />
          <p class="hint">参加者に表示される場所です</p>
        </label>
      </section>
      <section class="group">
        <p class="group-title">価格・定員</p>
        <label class="field">
          <span>参加費（1回あたり） *</span>
          <div class="input-row">
            <input v-model.number="form.priceYenPerLesson" type="number" min="0" required />
            <span class="suffix">/ 回</span>
          </div>
          <p class="hint">※ 各回ごとに支払いが行われます</p>
        </label>
        <label class="field">
          <span>デフォルト定員（各回）</span>
          <input
            v-model.number="form.defaultCapacity"
            type="number"
            min="0"
            placeholder="未設定可（回ごとに変更できます）"
          />
        </label>
      </section>
      <div class="footer">
        <button class="primary" type="submit" :disabled="submitting">
          {{ submitting ? '保存中…' : '教室を作成して次へ' }}
        </button>
      </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createConsoleClass, fetchConsoleClasses, updateConsoleClass } from '../../../api/client';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const classId = computed(() => (route.params.classId as string) || (route.query.classId as string) || '');
const isEdit = computed(() => Boolean(classId.value));
const loading = ref(false);
const submitting = ref(false);
const showTopBar = computed(() => !isLineInAppBrowser());
const form = ref({
  title: '',
  description: '',
  locationName: '',
  priceYenPerLesson: 0,
  defaultCapacity: null as number | null,
});

const handleSubmit = async () => {
  try {
    submitting.value = true;
    let createdId: string | null = null;
    if (isEdit.value) {
      await updateConsoleClass(classId.value, form.value);
      createdId = classId.value;
    } else {
      const res = await createConsoleClass(form.value);
      createdId = (res as any)?.id ?? null;
    }
    toast.show('教室を作成しました');
    if (createdId) {
      router.push({ name: 'ConsoleMobileLessons', params: { classId: createdId } });
    } else {
      router.push({ name: 'ConsoleMobileClasses' });
    }
  } catch (err: any) {
    toast.show(err?.message ?? '保存に失敗しました');
  } finally {
    submitting.value = false;
  }
};

const goBack = () => router.back();

const loadExisting = async () => {
  if (!isEdit.value) return;
  try {
    loading.value = true;
    const all = await fetchConsoleClasses();
    const target = all.find((c) => c.id === classId.value);
    if (!target) {
      toast.show('教室が見つかりません');
      router.back();
      return;
    }
    form.value.title = target.title || '';
    form.value.description = (target as any).description || '';
    form.value.locationName = target.locationName || '';
    form.value.priceYenPerLesson = target.priceYenPerLesson || 0;
    form.value.defaultCapacity = target.defaultCapacity ?? null;
  } catch (err: any) {
    toast.show(err?.message ?? '読み込みに失敗しました');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadExisting().catch(() => {});
});
</script>

<style scoped>
.class-form {
  padding: 16px;
  max-width: 520px;
  margin: 0 auto;
  box-sizing: border-box;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}
.group {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
.group-title {
  margin: 0 0 8px;
  font-weight: 700;
  color: #0f172a;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
}
input,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  background: #f8fafc;
}
input:focus,
textarea:focus {
  outline: 2px solid #c7d2fe;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.suffix {
  font-weight: 700;
  color: #0f172a;
}
.hint {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.primary {
  width: 100%;
  height: 48px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  border-radius: 12px;
  padding: 0 16px;
  font-weight: 700;
}
.footer {
  position: sticky;
  bottom: 0;
  padding: 12px 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 40%, #fff 100%);
}
.info-banner {
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #0f172a;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.info-text {
  margin: 0;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-line {
  height: 12px;
  background: #e5e7eb;
  border-radius: 10px;
}
.sk-line.title {
  width: 70%;
}
</style>
