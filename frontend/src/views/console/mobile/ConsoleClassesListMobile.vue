<template>
  <div class="classes-admin">
    <ConsoleTopBar v-if="showTopBar" title="教室管理" @back="goBack" />
    <div v-if="loading" class="skeleton">
      <div class="sk-card" v-for="n in 3" :key="n">
        <div class="sk-line title"></div>
        <div class="sk-line"></div>
      </div>
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="ghost" type="button" @click="load">再読み込み</button>
    </div>
    <div v-else>
      <div
        v-if="classes.length && hasUnscheduled"
        class="guide light"
      >
        <div>
          <p class="guide-title">レッスン日程が未設定の教室があります。</p>
          <p class="guide-desc">教室を選んで日程を追加しましょう。</p>
        </div>
        <button class="ghost" type="button" @click="goFirstEmptyLessons">レッスンを追加する</button>
      </div>

      <div v-if="!classes.length" class="state empty">
        <div class="empty-card">
          <div class="info-banner">
            <p class="info-text">
              教室は、毎週・定期的に開催する長期の講座やクラスを管理する機能です
            </p>
          </div>
          <div class="empty-body">
            <p class="state-title">教室を作成して、定期講座を始めましょう</p>
            <p class="state-sub">まず教室を作成し、あとでレッスンの日程を追加できます</p>
            <button class="primary large" type="button" @click="goCreate">教室を作成</button>
            <p class="hint">作成後に、レッスンの日程を追加できます</p>
          </div>
        </div>
      </div>

      <div class="class-list" v-else>
        <article
          v-for="cls in classes"
          :key="cls.id"
          class="class-card"
          @click="openLessons(cls.id)"
        >
          <div class="row">
            <div>
              <h2 class="title">{{ displayTitle(cls.title) }}</h2>
              <p class="meta small">¥{{ cls.priceYenPerLesson.toLocaleString() }} / 回</p>
              <div class="card-actions">
                <button class="ghost small" type="button" @click.stop="openLessons(cls.id)">レッスン管理</button>
                <button class="ghost small" type="button" @click.stop="openEdit(cls.id)">教室編集</button>
              </div>
            </div>
            <div class="badge-stack">
              <span class="chip" :class="{ 'chip--warn': (cls.futureLessonCount ?? 0) === 0 }">
                未来レッスン {{ cls.futureLessonCount ?? '未設定' }}
              </span>
              <button class="ghost icon" type="button" @click.stop="toggleMenu(cls.id)">
                <span class="i-lucide-more-horizontal"></span>
              </button>
              <div v-if="menuOpenId === cls.id" class="menu">
                <button type="button" class="danger" @click="confirmDelete(cls.id)">削除</button>
              </div>
            </div>
          </div>
        </article>
        <div class="footer-create">
          <button class="ghost wide" type="button" @click="goCreate">＋ 教室を作成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { deleteConsoleClass, fetchConsoleClasses } from '../../../api/client';
import type { ClassSummary } from '../../../types/api';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';

const classes = ref<(ClassSummary & { futureLessonCount?: number })[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const router = useRouter();
const toast = useToast();
const showTopBar = computed(() => !isLineInAppBrowser());
const menuOpenId = ref<string | null>(null);
const hasUnscheduled = computed(() => classes.value.some((c) => (c.futureLessonCount ?? 0) === 0));

const load = async () => {
  try {
    loading.value = true;
    error.value = null;
    classes.value = await fetchConsoleClasses();
  } catch (err: any) {
    error.value = err?.message ?? '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const goCreate = () => {
  router.push({ name: 'ConsoleMobileClassForm', query: { mode: 'create' } });
};

const openEdit = (classId: string) => {
  router.push({ name: 'ConsoleMobileClassForm', query: { mode: 'edit', classId } });
  menuOpenId.value = null;
};

const openLessons = (classId: string) => {
  router.push({ name: 'ConsoleMobileLessons', params: { classId } });
};

const goBack = () => {
  router.back();
};

const confirmDelete = async (classId: string) => {
  if (!window.confirm('この教室を削除しますか？既存のレッスンも無効化されます。')) return;
  try {
    await deleteConsoleClass(classId);
    toast.show('削除しました');
    await load();
  } catch (err: any) {
    toast.show(err?.message ?? '削除に失敗しました');
  }
};

onMounted(() => {
  load().catch((err) => toast.show(err?.message ?? 'エラーが発生しました'));
});

const toggleMenu = (id: string) => {
  menuOpenId.value = menuOpenId.value === id ? null : id;
};

const displayTitle = (title: any) => {
  if (!title) return '（無題）';
  if (typeof title === 'string') return title;
  return title.ja || title['ja-JP'] || title.zh || title['zh-CN'] || title.original || '（無題）';
};
</script>

<style scoped>
.classes-admin {
  padding: 32px 16px 20px;
  margin: 0 auto;
  max-width: 520px;
  box-sizing: border-box;
}
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
}
.ghost.small {
  padding: 6px 10px;
  font-weight: 600;
  font-size: 13px;
}
.ghost.wide {
  width: 100%;
  max-width: 420px;
  justify-content: center;
}
.ghost.danger {
  color: #dc2626;
  border-color: #fecdd3;
}
.primary {
  height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  font-weight: 700;
}
.primary.large {
  width: 100%;
  max-width: 320px;
  height: 48px;
  align-self: stretch;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}
.state {
  padding: 16px;
  text-align: center;
  color: #6b7280;
}
.state.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px 32px;
  width: 100%;
  box-sizing: border-box;
}
.empty-card {
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  padding: 16px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  overflow: hidden;
}
.state.error {
  color: #dc2626;
}
.info-banner {
  width: 100%;
  border: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  color: #0f172a;
  border-radius: 12px;
  padding: 12px;
  line-height: 1.5;
  text-align: left;
}
.info-text {
  margin: 0;
  font-size: 14px;
  word-break: break-word;
  overflow-wrap: break-word;
}
.empty-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.state-title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
}
.state-sub {
  margin: 0;
  font-size: 14px;
  color: #475569;
  text-align: center;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}
.guide.light {
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #0f172a;
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  margin-top: 8px;
}
.class-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.class-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 12px;
  background: #fff;
  position: relative;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
  margin-top: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.price {
  font-weight: 700;
}
.meta {
  margin: 4px 0;
  color: #6b7280;
  font-size: 13px;
}
.chip {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  font-size: 12px;
  color: #374151;
}
.chip--warn {
  background: #fee2e2;
  color: #b91c1c;
}
.badge-stack {
  display: flex;
  align-items: center;
  gap: 8px;
}
.menu {
  position: absolute;
  top: 14px;
  right: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  min-width: 140px;
  z-index: 5;
}
.menu button {
  padding: 10px 12px;
  text-align: left;
  border: none;
  background: transparent;
}
.menu button:hover {
  background: #f8fafc;
}
.menu button.danger {
  color: #dc2626;
}
.ghost.icon {
  padding: 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.card-actions .ghost {
  font-size: 13px;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sk-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.sk-line {
  height: 10px;
  background: #e5e7eb;
  border-radius: 8px;
  margin-bottom: 6px;
}
.sk-line.title {
  width: 70%;
}
.menu {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  min-width: 140px;
  z-index: 5;
}
.menu button {
  padding: 10px 12px;
  text-align: left;
  border: none;
  background: transparent;
}
.menu button:hover {
  background: #f8fafc;
}
.menu button.danger {
  color: #dc2626;
}
.ghost.icon {
  padding: 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.meta.small {
  font-size: 12px;
  margin-top: 2px;
}
.footer-create {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
