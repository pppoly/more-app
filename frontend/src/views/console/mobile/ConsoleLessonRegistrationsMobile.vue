<template>
  <div class="lesson-registrations">
    <ConsoleTopBar v-if="showTopBar" title="申込一覧" @back="goBack" />

    <header class="lesson-header">
      <div>
        <p class="lesson-datetime">{{ displayDate(route.query.startAt as string, route.query.endAt as string) }}</p>
        <p class="lesson-class">{{ (route.query.classTitle as string) || '教室' }}</p>
        <p v-if="route.query.locationName" class="lesson-meta">{{ route.query.locationName }}</p>
      </div>
      <span v-if="route.query.lessonStatus" class="chip" :class="{ cancelled: route.query.lessonStatus === 'cancelled' }">
        {{ statusLabel(route.query.lessonStatus as string) }}
      </span>
    </header>

    <section class="kpi-card">
      <div class="kpi">
        <p class="kpi-label">申込数</p>
        <p class="kpi-value">{{ registrations.length }}件</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">支払い合計（この回）</p>
        <p class="kpi-value">¥{{ (summary?.totalAmount ?? 0).toLocaleString() }}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">未払い</p>
        <p class="kpi-value">{{ unpaidCount }}件</p>
      </div>
    </section>

    <div class="filters">
      <button
        v-for="opt in filterOptions"
        :key="opt.value"
        class="chip-filter"
        :class="{ active: activeFilter === opt.value }"
        type="button"
        @click="activeFilter = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="loading" class="skeleton">
      <div class="sk-line" v-for="n in 5" :key="n"></div>
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="ghost" type="button" @click="load">再読み込み</button>
    </div>
    <div v-else>
      <div v-if="!filteredRegistrations.length" class="state empty">
        <p class="empty-title">まだ申込がありません</p>
        <p class="empty-desc">レッスン日程を追加したあと、参加者に申込リンクを共有できます</p>
        <div class="actions">
          <button class="ghost" type="button" @click="goBack">レッスン管理に戻る</button>
        </div>
      </div>
      <div v-else class="reg-list">
        <article v-for="reg in filteredRegistrations" :key="reg.id" class="reg-card">
          <span v-if="reg.status === 'cancel_requested'" class="flag">キャンセル申請中</span>
          <div class="row">
            <div class="user">
              <div class="avatar-shell">
                <AppAvatar :src="reg.user?.avatarUrl" :name="reg.user?.name" :size="36" />
              </div>
              <div>
                <p class="user-name">{{ reg.user?.name || 'ゲスト' }}</p>
                <p class="meta small">{{ formatDate(reg.createdAt) }}</p>
              </div>
            </div>
            <div class="status-block">
              <span class="badge" :class="badgeClass(reg.paymentStatus)">{{ paymentLabel(reg.paymentStatus) }}</span>
              <p class="amount">{{ amountLabel(reg.amount) }}</p>
            </div>
          </div>
          <div v-if="reg.status === 'cancel_requested'" class="action-row">
            <p class="hint">参加者からキャンセル申請が届いています。決済履歴で返金を処理してください。</p>
            <div class="action-buttons">
              <button class="ghost small" type="button" disabled>返金を承認（準備中）</button>
              <button class="ghost small" type="button" disabled>申請を却下（準備中）</button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchLessonPaymentSummary, fetchLessonRegistrations } from '../../../api/client';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';
import AppAvatar from '../../../components/common/AppAvatar.vue';

interface RegistrationItem {
  id: string;
  status: string;
  paymentStatus?: string;
  amount?: number | null;
  user?: { id: string; name?: string | null; avatarUrl?: string | null } | null;
  createdAt?: string;
}

const route = useRoute();
const router = useRouter();
const registrations = ref<RegistrationItem[]>([]);
const summary = ref<{ totalAmount: number; count: number } | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showTopBar = computed(() => !isLineInAppBrowser());
const activeFilter = ref<'all' | 'paid' | 'unpaid' | 'refund'>('all');
const filterOptions = [
  { value: 'all', label: 'すべて' },
  { value: 'paid', label: '支払い済み' },
  { value: 'unpaid', label: '未払い' },
  { value: 'refund', label: '返金中' },
];

const load = async () => {
  try {
    loading.value = true;
    registrations.value = await fetchLessonRegistrations(route.params.lessonId as string);
    summary.value = await fetchLessonPaymentSummary(route.params.lessonId as string);
  } catch (err: any) {
    error.value = err?.message ?? '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const goBack = () => {
  router.back();
};

const filteredRegistrations = computed(() => {
  if (activeFilter.value === 'all') return registrations.value;
  return registrations.value.filter((reg) => {
    const status = (reg.paymentStatus || '').toLowerCase();
    if (activeFilter.value === 'paid') return status.includes('paid') || status.includes('succeeded');
    if (activeFilter.value === 'unpaid') return status.includes('unpaid') || status.includes('pending');
    if (activeFilter.value === 'refund') return status.includes('refund');
    return true;
  });
});

const unpaidCount = computed(() =>
  registrations.value.filter((reg) => (reg.paymentStatus || '').toLowerCase().includes('unpaid')).length,
);

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate()
    .toString()
    .padStart(2, '0')}(${wd}) ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

const displayDate = (startAt?: string, endAt?: string) => {
  if (!startAt) return 'レッスン日程';
  const start = formatDate(startAt);
  if (!endAt) return start;
  const end = formatDate(endAt).split(' ').pop() || '';
  return `${start}–${end}`;
};

const paymentLabel = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('refund')) return '返金中';
  if (s.includes('paid') || s.includes('succeeded')) return '支払い済み';
  if (s.includes('unpaid') || s.includes('pending')) return '未払い';
  return '状態不明';
};

const statusLabel = (status?: string) => {
  if (!status) return '';
  if (status === 'cancelled') return 'キャンセル';
  return '受付中';
};

const badgeClass = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('refund')) return 'badge warn';
  if (s.includes('paid') || s.includes('succeeded')) return 'badge success';
  if (s.includes('unpaid') || s.includes('pending')) return 'badge muted';
  return 'badge';
};

const amountLabel = (amount?: number | null) => {
  if (!amount || amount <= 0) return '無料';
  return `¥${amount.toLocaleString()}`;
};
</script>

<style scoped>
.lesson-registrations {
  padding: 16px;
}
.lesson-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
}
.lesson-datetime {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.lesson-class {
  margin: 2px 0;
  color: #475569;
}
.lesson-meta {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
.kpi-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f8fafc;
  margin-bottom: 12px;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
.kpi-value {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}
.filters {
  display: flex;
  gap: 8px;
  margin: 8px 0 12px;
}
.chip-filter {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 999px;
  font-weight: 700;
}
.chip-filter.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.state {
  padding: 12px;
  text-align: center;
  color: #6b7280;
}
.state.error {
  color: #dc2626;
}
.state.empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.empty-title {
  margin: 0;
  font-weight: 800;
}
.empty-desc {
  margin: 0;
  color: #475569;
}
.actions {
  display: flex;
  gap: 8px;
}
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
}
.ghost.small {
  padding: 8px 10px;
}
.reg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reg-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  position: relative;
}
.flag {
  position: absolute;
  top: -6px;
  left: 0;
  background: #f97316;
  color: #fff;
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}
.action-row {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #e5e7eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #475569;
}
.user-name {
  margin: 0;
  font-weight: 700;
}
.meta {
  margin: 4px 0 0;
  color: #6b7280;
}
.meta.small {
  font-size: 12px;
}
.status-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.badge {
  background: #eef2ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.badge.success {
  background: #dcfce7;
  color: #15803d;
}
.badge.warn {
  background: #fef9c3;
  color: #92400e;
}
.badge.muted {
  background: #e5e7eb;
  color: #475569;
}
.chip.cancelled {
  background: #fee2e2;
  color: #b91c1c;
}
.amount {
  margin: 0;
  font-weight: 800;
  color: #0f172a;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #475569;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sk-line {
  height: 14px;
  border-radius: 8px;
  background: #e5e7eb;
}
</style>
