<template>
  <section class="console-section">
    <header class="section-header">
      <div>
        <h2>{{ eventTitle }}</h2>
        <p v-if="eventDetail" class="sub">{{ formatDate(eventDetail.startTime) }}</p>
      </div>
      <RouterLink :to="backLink">イベント一覧へ戻る</RouterLink>
    </header>

    <p v-if="loading" class="status">参加者リスト取得中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else>
      <table class="reg-table" v-if="registrations.length">
        <thead>
          <tr>
            <th>参加者</th>
            <th>Status</th>
            <th>Payment</th>
            <th>申込日時</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="reg in registrations" :key="reg.id">
            <td>{{ reg.user.name }}</td>
            <td>{{ reg.status }}</td>
            <td>{{ reg.paymentStatus }}</td>
            <td>{{ formatDate(reg.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">まだ参加者がありません。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchConsoleEvent, fetchConsoleEventRegistrations } from '../../api/client';
import type { ConsoleEventDetail, ConsoleEventRegistration } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const route = useRoute();
const eventId = route.params.eventId as string;

const eventDetail = ref<ConsoleEventDetail | null>(null);
const registrations = ref<ConsoleEventRegistration[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const eventTitle = ref('イベント詳細');
const backLink = ref('/console/communities');

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    eventDetail.value = await fetchConsoleEvent(eventId);
    eventTitle.value = getLocalizedText(eventDetail.value.title);
    backLink.value = `/console/communities/${eventDetail.value.communityId}/events`;
    registrations.value = await fetchConsoleEventRegistrations(eventId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

onMounted(load);
</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reg-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  overflow: hidden;
}

.reg-table th,
.reg-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.reg-table tbody tr:last-child td {
  border-bottom: none;
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
</style>
