<template>
  <div class="classes-page">
    <ConsoleTopBar v-if="showTopBar" title="教室" @back="goBack" />

    <div v-if="loading" class="skeleton">
      <div class="sk-card" v-for="n in 3" :key="n">
        <div class="sk-line title"></div>
        <div class="sk-line short"></div>
        <div class="sk-line"></div>
      </div>
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="ghost" type="button" @click="load">再読み込み</button>
    </div>
    <div v-else>
      <div v-if="!classes.length" class="state">
        <p class="state-title">このコミュニティには教室がありません</p>
        <p class="hint">イベントや教室の情報は、コミュニティから順次公開されます</p>
      </div>
      <div class="class-list" v-else>
        <article v-for="cls in classes" :key="cls.id" class="class-card" @click="openDetail(cls.id)">
          <div class="card-body">
            <div class="row">
              <h2 class="class-title">{{ displayTitle(cls.title) }}</h2>
              <p class="price">¥{{ cls.priceYenPerLesson.toLocaleString() }} / 1回</p>
            </div>
            <p class="description" v-if="displaySecondary(cls)">{{ displaySecondary(cls) }}</p>
            <div class="meta">
              <span class="pill">次回</span>
              <span class="meta-text">{{ cls.nextLesson ? formatLesson(cls.nextLesson.startAt) : '次回未定' }}</span>
              <span v-if="cls.myRegistered" class="pill success">申込済み</span>
            </div>
          </div>
          <span class="chevron">›</span>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCommunityBySlug, fetchCommunityClasses } from '../../api/client';
import type { ClassSummary } from '../../types/api';
import { isLineInAppBrowser } from '../../utils/liff';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';

const route = useRoute();
const router = useRouter();
const classes = ref<ClassSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const communityName = ref('');
const communityId = ref<string>('');
const showTopBar = computed(() => !isLineInAppBrowser());
const LOCAL_REG_KEY = 'class_registrations';

const getLocalRegistrations = () => {
  try {
    const raw = localStorage.getItem(LOCAL_REG_KEY);
    return raw ? (JSON.parse(raw) as Array<{ classId: string; lessonId?: string }>) : [];
  } catch {
    return [];
  }
};

const weekday = ['日', '月', '火', '水', '木', '金', '土'];
const formatLesson = (startAt: string) => {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return '';
  const w = weekday[d.getDay()];
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d
    .getDate()
    .toString()
    .padStart(2, '0')}(${w}) ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

const displayTitle = (title: any) => {
  if (!title) return '（無題）';
  if (typeof title === 'string') return title;
  return title.ja || title['ja-JP'] || title.zh || title['zh-CN'] || title.original || '（無題）';
};

const displaySecondary = (cls: any) => {
  const loc = cls.locationName;
  const desc = cls.description;
  const text =
    typeof desc === 'string'
      ? desc
      : desc?.ja || desc?.['ja-JP'] || desc?.zh || desc?.['zh-CN'] || desc?.original || '';
  const cleaned = text?.trim() || '';
  const isJunk = !cleaned || cleaned.length < 4 || /[ぁ-んァ-ン一-龥]/.test(cleaned) === false && cleaned.length < 8;
  if (loc && loc.trim().length > 0) return loc;
  if (!isJunk) return cleaned;
  return '';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = null;
    const community = await fetchCommunityBySlug(route.params.slug as string);
    communityName.value = community.name;
    communityId.value = community.id;
    const regs = getLocalRegistrations();
    const regSet = new Set(regs.map((r) => r.classId));
    classes.value = (await fetchCommunityClasses(community.id)).map((c) => ({
      ...c,
      myRegistered: regSet.has(c.id),
    }));
  } catch (err: any) {
    error.value = err?.message ?? '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const openDetail = (classId: string) => {
  router.push({ name: 'community-class-detail', params: { slug: route.params.slug, classId } });
};

onMounted(load);

const goBack = () => {
  router.back();
};
</script>

<style scoped>
.classes-page {
  padding: 0 0 16px;
}
.subtitle {
  margin: 0;
}
.community-name {
  color: #6b7280;
  font-size: 13px;
}
.state {
  padding: 24px 0;
  text-align: center;
  color: #6b7280;
}
.state.error {
  color: #dc2626;
}
.class-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
  margin-top: 12px;
}
.class-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
  min-height: 120px;
  transition: background 0.1s ease, transform 0.1s ease;
}
.card-body {
  position: relative;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.class-card:active {
  background: #f3f4f6;
  transform: translateY(1px);
}
.class-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.class-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
  color: #0f172a;
  max-height: 3.2em;
  overflow: hidden;
}
.price {
  margin: 0;
  font-weight: 800;
  color: #0f172a;
  font-size: 15px;
}
.description {
  margin: 4px 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.4;
}
.location {
  margin: 6px 0;
  color: #4b5563;
  font-size: 14px;
}
.next-lesson {
  margin: 0;
  font-size: 13px;
  color: #1f2937;
  display: flex;
  gap: 6px;
  align-items: center;
}
.label {
  background: #e0e7ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
}
.pill {
  background: #e0e7ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.price-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
}
.chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 20px;
}
.debug {
  font-size: 12px;
  color: #94a3b8;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.sk-line.short {
  width: 40%;
}
</style>
