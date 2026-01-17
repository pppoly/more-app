<template>
  <main class="admin-settlements">
    <header class="page-head">
      <div>
        <p class="eyebrow">結算モニター</p>
        <h1>Settlements</h1>
        <p class="subhead">Settlement Run の履歴と実行結果を確認できます。</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="config" class="config-grid">
        <div class="config-item">
          <p>状態</p>
          <strong>{{ config.settlementEnabled ? '有効' : 'dry-run' }}</strong>
        </div>
        <div class="config-item">
          <p>タイムゾーン</p>
          <strong>{{ config.timezone }}</strong>
        </div>
        <div class="config-item">
          <p>N（遅延日数）</p>
          <strong>{{ config.settlementDelayDays }}日</strong>
        </div>
        <div class="config-item">
          <p>D（ウィンドウ）</p>
          <strong>{{ config.settlementWindowDays }}日</strong>
        </div>
        <div class="config-item">
          <p>最小振込額</p>
          <strong>¥{{ formatNumber(config.settlementMinTransferAmount) }}</strong>
        </div>
        <div class="config-item">
          <p>自動実行</p>
          <strong>
            {{ config.settlementAutoRunEnabled ? `${pad2(config.settlementAutoRunHour)}:${pad2(config.settlementAutoRunMinute)}` : '無効' }}
          </strong>
        </div>
      </div>
      <div v-else class="empty muted">設定を取得しています…</div>
    </section>

    <section class="filters card">
      <div class="filter-row">
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="dry_run">dry_run</option>
            <option value="pending">pending</option>
            <option value="processing">processing</option>
            <option value="completed">completed</option>
            <option value="partial_failed">partial_failed</option>
            <option value="failed">failed</option>
            <option value="blocked">blocked</option>
          </select>
        </label>
      </div>
      <button class="primary full" type="button" :disabled="loading" @click="applyFilters">適用</button>
    </section>

    <section class="card">
      <header class="card-head">
        <div>
          <p class="eyebrow">手動実行</p>
          <h2>Settlement Run</h2>
          <p class="meta muted">期間を指定しない場合、直近 D 日のウィンドウで実行します。</p>
        </div>
        <button class="primary" type="button" :disabled="loading || running" @click="openRunConfirm">
          実行
        </button>
      </header>

      <div class="run-grid">
        <label>
          periodFrom
          <input v-model="runPeriodFrom" type="datetime-local" />
        </label>
        <label>
          periodTo
          <input v-model="runPeriodTo" type="datetime-local" />
        </label>
      </div>
      <p class="meta muted">
        注意: 手動実行でもルール（event.endAt+N / dispute / onboarding 等）は一切バイパスできません。
      </p>
    </section>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!batches.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="batch in batches" :key="batch.batchId" class="batch-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ batch.batchId }}</p>
              <h3>{{ formatDate(batch.runAt) }}</h3>
              <p class="meta">期間: {{ formatDate(batch.periodFrom) }} → {{ formatDate(batch.periodTo) }}</p>
              <p class="meta">転送: {{ batch.settlementEnabled ? '有効' : 'dry-run' }} / hosts: {{ batch.hosts }}</p>
            </div>
            <span class="pill" :class="statusClass(batch.status)">{{ batch.status }}</span>
          </div>
          <p class="meta">
            成功: {{ batch.counts.succeeded }} · 失敗: {{ batch.counts.failed }} · blocked: {{ batch.counts.blocked }} · pending: {{ batch.counts.pending }}
          </p>
          <div class="actions">
            <button class="ghost" type="button" :disabled="loading" @click="openBatch(batch.batchId)">詳細</button>
            <button class="ghost" type="button" :disabled="downloadingId === batch.batchId" @click="download(batch.batchId)">
              エクスポート
            </button>
          </div>
        </article>
      </div>
    </section>

    <AdminConfirmModal
      :open="runConfirmOpen"
      title="Settlement Run を実行しますか？"
      :message="runConfirmMessage"
      :loading="running"
      @close="runConfirmOpen = false"
      @confirm="run"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AdminSettlementBatchListItem, AdminSettlementConfig } from '../../types/api';
import {
  adminRunSettlement,
  fetchAdminSettlementBatchCsv,
  fetchAdminSettlementBatches,
  fetchAdminSettlementConfig,
} from '../../api/client';
import { useToast } from '../../composables/useToast';
import AdminConfirmModal from '../../components/admin/AdminConfirmModal.vue';

const router = useRouter();
const toast = useToast();

const config = ref<AdminSettlementConfig | null>(null);
const batches = ref<AdminSettlementBatchListItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const downloadingId = ref<string | null>(null);
const running = ref(false);
const runConfirmOpen = ref(false);
const runPeriodFrom = ref('');
const runPeriodTo = ref('');
const filters = ref<{ status?: string }>({});

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatNumber = (val?: number | null) => new Intl.NumberFormat('ja-JP').format(val ?? 0);
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusClass = (status: string) => {
  if (status === 'completed') return 'pill-live';
  if (status === 'pending' || status === 'processing') return 'pill-pending';
  if (status === 'dry_run') return 'pill-info';
  if (status === 'blocked') return 'pill-info';
  if (status === 'partial_failed') return 'pill-danger';
  if (status === 'failed') return 'pill-danger';
  return 'pill-info';
};

const openBatch = (batchId: string) => {
  router.push({ name: 'admin-settlement-batch', params: { batchId } });
};

const download = async (batchId: string) => {
  downloadingId.value = batchId;
  try {
    const { blob, filename } = await fetchAdminSettlementBatchCsv(batchId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.show('エクスポートしました', 'success');
  } catch {
    toast.show('エクスポートに失敗しました', 'error');
  } finally {
    downloadingId.value = null;
  }
};

const applyFilters = async () => {
  await load();
};

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    const [cfg, list] = await Promise.all([
      fetchAdminSettlementConfig(),
      fetchAdminSettlementBatches({ status: filters.value.status || undefined }),
    ]);
    config.value = cfg;
    batches.value = list.items || [];
  } catch {
    error.value = 'ロードに失敗しました';
    toast.show('読み込みに失敗しました', 'error');
  } finally {
    loading.value = false;
  }
};

const openRunConfirm = () => {
  runConfirmOpen.value = true;
};

const runConfirmMessage = computed(() => {
  if (!runPeriodFrom.value && !runPeriodTo.value) {
    return '直近 D 日のウィンドウで手動実行します。';
  }
  return `指定期間で手動実行します。\nperiodFrom=${runPeriodFrom.value}\nperiodTo=${runPeriodTo.value}`;
});

const run = async () => {
  running.value = true;
  try {
    const payload: { periodFrom?: string; periodTo?: string } = {};
    if (runPeriodFrom.value || runPeriodTo.value) {
      const from = runPeriodFrom.value ? new Date(runPeriodFrom.value) : null;
      const to = runPeriodTo.value ? new Date(runPeriodTo.value) : null;
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        toast.show('periodFrom / periodTo が不正です', 'error');
        running.value = false;
        return;
      }
      payload.periodFrom = from.toISOString();
      payload.periodTo = to.toISOString();
    }
    await adminRunSettlement(payload);
    toast.show('実行しました', 'success');
    runConfirmOpen.value = false;
    await load();
  } catch {
    toast.show('実行に失敗しました', 'error');
  } finally {
    running.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.admin-settlements {
  min-height: 100vh;
  padding: 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.page-head h1 {
  margin: 4px 0;
}
.ghost {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.config-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.filter-row select,
.run-grid input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
}
.primary {
  border: none;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
}
.primary.full {
  width: 100%;
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.batch-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.meta {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
.muted {
  opacity: 0.8;
}
.empty {
  padding: 18px 0;
  text-align: center;
  color: #64748b;
}
.error {
  color: #dc2626;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f1f5f9;
}
.pill-live {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.35);
}
.pill-pending {
  background: rgba(37, 99, 235, 0.14);
  border-color: rgba(37, 99, 235, 0.28);
}
.pill-info {
  background: rgba(148, 163, 184, 0.22);
  border-color: rgba(148, 163, 184, 0.4);
}
.pill-danger {
  background: rgba(220, 38, 38, 0.16);
  border-color: rgba(220, 38, 38, 0.35);
}
.run-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
</style>

