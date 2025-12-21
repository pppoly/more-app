<template>
  <section class="console-section">
    <header class="section-header">
      <div>
        <h2>{{ eventTitle }}</h2>
        <p v-if="eventDetail" class="sub">{{ formatDate(eventDetail.startTime) }}</p>
      </div>
      <RouterLink :to="backLink">イベント一覧へ戻る</RouterLink>
    </header>

    <p v-if="loading" class="status">参加者データを読み込み中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else>
      <section v-if="summary" class="summary-card">
        <div class="summary-header">
          <div>
            <h3>{{ summary.title }}</h3>
            <span :class="['badge', eventStatusClass]">{{ eventStatusLabel }}</span>
          </div>
          <div class="summary-actions">
            <button type="button" class="secondary" @click="downloadCsv" :disabled="downloading">
              {{ downloading ? '生成中…' : '名簿をエクスポート' }}
            </button>
            <button type="button" class="ghost" disabled>メンバー管理</button>
          </div>
        </div>
        <div class="summary-stats">
          <div class="stat">
            <p>参加者</p>
            <strong>
              {{ summary.totalRegistrations }}<span v-if="summary.capacity"> / {{ summary.capacity }}</span>
            </strong>
          </div>
          <div class="stat">
            <p>支払済み</p>
            <strong>{{ summary.paidRegistrations }}</strong>
          </div>
          <div class="stat">
            <p>出席済み</p>
            <strong>{{ summary.attended }}</strong>
          </div>
          <div class="stat">
            <p>無断欠席</p>
            <strong>{{ summary.noShow }}</strong>
          </div>
        </div>
        <div class="group-progress" v-if="summary.groups.length">
          <div v-for="group in summary.groups" :key="group.label" class="group-row">
            <div class="group-label">
              <span>{{ group.label }}</span>
              <span>{{ group.count }} / {{ group.capacity ?? summary.capacity ?? group.count }}</span>
            </div>
            <div class="progress">
              <div class="fill" :style="{ width: progressPercent(group) + '%' }"></div>
            </div>
          </div>
        </div>
        <div class="avatar-wall" v-if="summary.avatars.length">
          <div v-for="avatar in summary.avatars" :key="avatar.userId" class="avatar-item">
            <AppAvatar :src="avatar.avatarUrl" :name="avatar.name" :size="48" />
            <small>{{ avatar.name || 'ゲスト' }}</small>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h3>参加者一覧 ({{ totalRegistrations }}件)</h3>
          <div class="actions-inline">
            <button type="button" class="ghost" @click="downloadCsv" :disabled="downloading">
              {{ downloading ? '生成中…' : 'CSV をエクスポート' }}
            </button>
            <button type="button" class="danger" :disabled="cancelling" @click="confirmCancel">
              {{ cancelling ? '取消处理中…' : '取消活动' }}
            </button>
          </div>
        </div>
        <table class="reg-table" v-if="registrations.length">
          <thead>
            <tr>
              <th>参加者</th>
              <th>チケット</th>
              <th>支払い</th>
              <th>状态</th>
              <th>出席</th>
              <th>申込時間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="reg in registrations" :key="reg.registrationId">
              <tr>
                <td>
                  <div class="user-cell">
                    <AppAvatar :src="reg.user.avatarUrl" :name="reg.user.name" :size="40" />
                    <div>
                      <p>{{ reg.user.name }}</p>
                      <small>ID: {{ reg.user.id }}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="ticket">
                    <p>{{ reg.ticket?.name || 'ー' }}</p>
                    <small v-if="reg.ticket">¥{{ reg.ticket.price ?? 0 }}</small>
                  </div>
                </td>
                <td>
                  <span :class="['pill', reg.paymentStatus]">{{ paymentLabel(reg.paymentStatus) }}</span>
                </td>
                <td>
                  <span :class="['pill', statusClass(reg.status)]">{{ registrationStatusLabel(reg.status) }}</span>
                </td>
                <td>
                  <span :class="['pill', reg.attended ? 'attended' : reg.noShow ? 'noshow' : 'pending']">
                    {{ attendanceLabel(reg) }}
                  </span>
                </td>
                <td>{{ formatDate(reg.createdAt) }}</td>
                <td class="actions-cell">
                  <div class="actions-stack">
                    <div v-if="reg.status === 'pending'" class="actions-inline">
                      <button
                        type="button"
                        class="ghost tiny"
                        :disabled="actionLoading[reg.registrationId]"
                        @click="handleReject(reg.registrationId)"
                      >
                        {{ actionLoading[reg.registrationId] ? '処理中…' : '拒否' }}
                      </button>
                    </div>
                    <button
                      v-if="hasRegistrationForm"
                      type="button"
                      class="ghost"
                      @click="toggleAnswers(reg.registrationId)"
                    >
                      {{ expandedRows[reg.registrationId] ? 'フォームを閉じる' : 'フォームを見る' }}
                    </button>
                    <span v-else class="muted">申込フォームなし</span>
                  </div>
                </td>
              </tr>
              <tr v-if="expandedRows[reg.registrationId]" class="answers-row">
                <td colspan="7">
                  <div v-if="hasRegistrationForm && formEntries(reg).length" class="answers">
                    <div v-for="[key, value] in formEntries(reg)" :key="key" class="answer-row">
                      <span class="answer-label">{{ key }}</span>
                      <span class="answer-value">{{ formatAnswer(value) }}</span>
                    </div>
                  </div>
                  <p v-else class="muted">
                    {{ hasRegistrationForm ? '回答はありません。' : 'このイベントは申込フォーム未設定です。' }}
                  </p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <p v-else class="muted">まだ参加者が登録されていません。</p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import {
  fetchConsoleEvent,
  fetchEventRegistrationsSummary,
  fetchEventRegistrations,
  exportEventRegistrationsCsv,
  rejectEventRegistration,
  cancelConsoleEvent,
} from '../../api/client';
import { useConfirm } from '../../composables/useConfirm';
import type {
  ConsoleEventDetail,
  ConsoleEventRegistrationItem,
  EventRegistrationsSummary,
} from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { getEventStatusLabel, resolveEventStatusState } from '../../utils/eventStatus';
import AppAvatar from '../../components/common/AppAvatar.vue';

const route = useRoute();
const eventId = route.params.eventId as string;

const eventDetail = ref<ConsoleEventDetail | null>(null);
const eventTitle = ref('イベント詳細');
const backLink = ref<RouteLocationRaw>({ name: 'console-communities' });
const summary = ref<EventRegistrationsSummary | null>(null);
const registrations = ref<ConsoleEventRegistrationItem[]>([]);
const totalRegistrations = ref(0);
const expandedRows = ref<Record<string, boolean>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const downloading = ref(false);
const actionLoading = ref<Record<string, boolean>>({});
const cancelling = ref(false);
const { confirm: confirmDialog } = useConfirm();

const eventStatusState = computed(() => {
  if (!eventDetail.value) return 'closed';
  return resolveEventStatusState({
    status: eventDetail.value.status,
    startTime: eventDetail.value.startTime,
    endTime: eventDetail.value.endTime,
    regStartTime: eventDetail.value.regStartTime,
    regEndTime: eventDetail.value.regEndTime,
    regDeadline: eventDetail.value.regDeadline,
    maxParticipants: eventDetail.value.maxParticipants ?? null,
    config: {
      ...(eventDetail.value.config ?? {}),
      currentParticipants: summary.value?.totalRegistrations ?? undefined,
    },
  });
});
const eventStatusLabel = computed(() => getEventStatusLabel(eventStatusState.value));
const eventStatusClass = computed(() => (eventStatusState.value === 'open' ? 'open' : 'closed'));
const hasRegistrationForm = computed(
  () => Boolean(eventDetail.value?.registrationFormSchema?.length),
);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    eventDetail.value = await fetchConsoleEvent(eventId);
    eventTitle.value = getLocalizedText(eventDetail.value.title);
    backLink.value = {
      name: 'console-community-events',
      params: { communityId: eventDetail.value.communityId },
    };
    summary.value = await fetchEventRegistrationsSummary(eventId);
    const list = await fetchEventRegistrations(eventId);
    registrations.value = list.items;
    totalRegistrations.value = list.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '参加者情報の取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const paymentLabel = (status: string) => {
  switch (status) {
    case 'paid':
      return '支払済み';
    case 'unpaid':
      return '未払い';
    case 'refunded':
      return '返金済み';
    default:
      return status;
  }
};

const attendanceLabel = (reg: ConsoleEventRegistrationItem) => {
  if (reg.attended) return '出席';
  if (reg.noShow) return '無断欠席';
  return '未開始';
};

const progressPercent = (group: { count: number; capacity?: number | null }) => {
  const fallback = group.count || 1;
  const cap = group.capacity ?? summary.value?.capacity ?? fallback;
  return Math.min(100, Math.round((group.count / cap) * 100));
};

const avatarInitial = (name?: string | null) => (name ? name.charAt(0).toUpperCase() : '?');

const toggleAnswers = (id: string) => {
  expandedRows.value[id] = !expandedRows.value[id];
};

const formEntries = (reg: ConsoleEventRegistrationItem) =>
  Object.entries((reg.formAnswers ?? {}) as Record<string, unknown>);

const formatAnswer = (value: unknown) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const registrationStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return '審査待ち';
    case 'approved':
      return '承認済み';
    case 'rejected':
      return '拒否';
    case 'paid':
      return '支払済み';
    case 'refunded':
      return '返金済み';
    case 'pending_refund':
      return '返金待ち';
    case 'cancelled':
      return 'キャンセル';
    default:
      return status;
  }
};

const statusClass = (status: string) => {
  if (status === 'pending') return 'pending';
  if (status === 'approved' || status === 'paid') return 'approved';
  if (status === 'refunded') return 'paid';
  if (status === 'pending_refund') return 'pending';
  if (status === 'rejected' || status === 'cancelled') return 'noshow';
  return 'pending';
};

const handleReject = async (registrationId: string) => {
  actionLoading.value = { ...actionLoading.value, [registrationId]: true };
  try {
    await rejectEventRegistration(eventId, registrationId);
    const target = registrations.value.find((r) => r.registrationId === registrationId);
    if (target) {
      target.status = 'rejected';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '拒绝失败，请重试';
  } finally {
    actionLoading.value = { ...actionLoading.value, [registrationId]: false };
  }
};

const downloadCsv = async () => {
  downloading.value = true;
  try {
    const blob = await exportEventRegistrationsCsv(eventId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${eventId}-registrations.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'CSVのエクスポートに失敗しました';
  } finally {
    downloading.value = false;
  }
};

const confirmCancel = async () => {
  if (!eventDetail.value) return;
  const sure = await confirmDialog('确认取消活动吗？收费报名将自动尝试退款，此操作不可逆。');
  if (!sure) return;
  cancelling.value = true;
  error.value = null;
  try {
    await cancelConsoleEvent(eventId, { notify: false });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '取消失败，请稍后再试';
  } finally {
    cancelling.value = false;
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
.summary-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.summary-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  background: #e2e8f0;
}
.badge.open {
  background: #dcfce7;
  color: #15803d;
}
.badge.closed {
  background: #fee2e2;
  color: #b91c1c;
}
.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.8rem;
}
.stat {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.75rem;
}
.stat p {
  margin: 0;
  color: #475569;
}
.stat strong {
  font-size: 1.5rem;
}
.group-progress {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.group-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.group-label {
  display: flex;
  justify-content: space-between;
  color: #475569;
  font-size: 0.9rem;
}
.progress {
  width: 100%;
  height: 10px;
  background: #e2e8f0;
  border-radius: 999px;
}
.progress .fill {
  height: 100%;
  background: #4ade80;
  border-radius: 999px;
}
.avatar-wall {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.5rem;
}
.avatar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
}
.avatar-item img,
.avatar-fallback {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
.summary-actions {
  display: flex;
  gap: 0.5rem;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.reg-table {
  width: 100%;
  border-collapse: collapse;
}
.reg-table th,
.reg-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.user-cell img,
.user-cell .avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ticket p {
  margin: 0;
}
.pill {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.85rem;
  background: #f1f5f9;
}
.pill.paid {
  background: #dcfce7;
  color: #15803d;
}
.pill.unpaid {
  background: #fee2e2;
  color: #b91c1c;
}
.pill.attended {
  background: #d1fae5;
  color: #065f46;
}
.pill.noshow {
  background: #fee2e2;
  color: #dc2626;
}
.pill.pending {
  background: #e0f2fe;
  color: #0369a1;
}
.pill.approved {
  background: #dcfce7;
  color: #15803d;
}
.actions-cell {
  text-align: right;
}
.actions-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}
.actions-inline {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.secondary.tiny,
.ghost.tiny {
  padding: 6px 10px;
  font-size: 13px;
}
.danger {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecdd3;
}
.answers-row {
  background: #f8fafc;
}
.answers {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.answer-row {
  display: flex;
  gap: 0.5rem;
}
.answer-label {
  min-width: 140px;
  color: #475569;
  font-weight: 600;
}
.answer-value {
  flex: 1;
}
.status {
  color: #475569;
}
.error {
  color: #b91c1c;
}
.muted {
  color: #94a3b8;
}
.primary {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: #2563eb;
  color: white;
  cursor: pointer;
}
.secondary {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  background: white;
  cursor: pointer;
}
.ghost {
  padding: 0.4rem 0.8rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  background: transparent;
  cursor: pointer;
}
</style>
