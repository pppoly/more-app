<template>
  <section class="my-events-page">
    <header>
      <h2>参加予定のイベント</h2>
      <p class="subtext">Dev Login で登録したイベントの一覧です。</p>
    </header>

    <p v-if="loading" class="status">Loading...</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <ul v-else-if="events.length" class="event-list">
      <li v-for="item in events" :key="item.registrationId" class="event-card">
        <RouterLink :to="`/events/${item.event.id}`">
          <h3>{{ titleFor(item.event) }}</h3>
        </RouterLink>
        <p class="community">{{ item.event.community.name }}</p>
        <p class="time">{{ formatDate(item.event.startTime) }}</p>
        <div class="badge-row">
          <span class="status-pill" :class="attendanceClass(item)">{{ attendanceLabel(item) }}</span>
          <span class="payment-pill" :class="paymentClass(item)">{{ paymentLabel(item) }}</span>
        </div>
      </li>
    </ul>
    <p v-else class="status muted">まだ参加予定のイベントがありません。</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchMyEvents } from '../../api/client';
import type { MyEventItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const events = ref<MyEventItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchMyEvents();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load events';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadEvents();
});

const titleFor = (event: MyEventItem['event']) => getLocalizedText(event.title);

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const paymentLabel = (item: MyEventItem) => {
  if ((item.amount ?? 0) === 0) {
    return '無料';
  }
  return item.paymentStatus === 'paid' ? '済' : '未';
};

const paymentClass = (item: MyEventItem) => {
  if ((item.amount ?? 0) === 0) {
    return 'free';
  }
  return item.paymentStatus === 'paid' ? 'paid' : 'unpaid';
};

const attendanceLabel = (item: MyEventItem) => {
  if (item.attended) return '出席済み';
  if (item.noShow) return '無断欠席';
  if (new Date(item.event.startTime) > new Date()) return '参加予定';
  return '記録なし';
};

const attendanceClass = (item: MyEventItem) => {
  if (item.attended) return 'attended';
  if (item.noShow) return 'no-show';
  if (new Date(item.event.startTime) > new Date()) return 'upcoming';
  return 'pending';
};
</script>

<style scoped>
.my-events-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.subtext {
  color: #475569;
}

.status {
  margin: 0.5rem 0;
}

.event-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.event-card {
  background: #fff;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.event-card h3 {
  margin: 0 0 0.5rem;
}

.community,
.time {
  margin: 0.2rem 0;
  color: #475569;
}

.badge-row {
  margin-top: 0.4rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status-pill,
.payment-pill {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.payment-pill.free {
  background: #e2e8f0;
  color: #0f172a;
}

.payment-pill.paid {
  background: #dcfce7;
  color: #15803d;
}

.payment-pill.unpaid {
  background: #fef3c7;
  color: #b45309;
}

.status-pill.attended {
  background: #dcfce7;
  color: #15803d;
}

.status-pill.no-show {
  background: #fee2e2;
  color: #b91c1c;
}

.status-pill.upcoming {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-pill.pending {
  background: #e2e8f0;
  color: #475569;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}
</style>
