<template>
  <main class="resource-detail">
    <header class="detail-hero">
      <button type="button" class="back-button" @click="goBack">
        <span class="i-lucide-arrow-left"></span>
        戻る
      </button>
      <p class="hero-chip">リソース設定</p>
      <h1>{{ groupMeta?.page || '不明なグループ' }}</h1>
      <p class="hero-desc">
        このページには {{ groupSlots.length }} 件のリソース枠があります。変更内容はこのブラウザ内にのみ保存され、下のボタンから JSON をインポート / エクスポートできます。
      </p>
      <div class="hero-actions">
        <button type="button" class="ghost-button" @click="handleExport">
          JSON をエクスポート
          <span class="i-lucide-download"></span>
        </button>
        <button type="button" class="primary-button" @click="handleImport">
          JSON をインポート
          <span class="i-lucide-upload"></span>
        </button>
      </div>
      <p v-if="heroStatus" class="hero-status">{{ heroStatus }}</p>
    </header>

    <section v-if="!groupSlots.length" class="empty-state">
      <p>このグループの設定項目が見つかりません。前のページに戻ってください。</p>
    </section>

    <section v-else class="slot-stack">
      <article
        v-for="slot in groupSlots"
        :key="slot.id"
        class="resource-card"
      >
        <div class="resource-head">
          <div>
            <p class="resource-eyebrow">{{ slot.position }}</p>
            <h2>{{ slot.label }}</h2>
          </div>
          <button type="button" class="reset-button" @click="reset(slot.id)">デフォルトに戻す</button>
        </div>
        <p class="resource-desc">{{ slot.description || 'このページの該当エリアで使用するプレースホルダー。' }}</p>
        <p v-if="slot.helper" class="resource-helper">{{ slot.helper }}</p>

        <div class="resource-preview">
          <template v-if="slot.type === 'image'">
            <img v-if="stringValue(slot.id)" :src="stringValue(slot.id)" alt="プレビュー" />
            <div v-else class="preview-empty">未設定のためデフォルトを使用します</div>
          </template>
          <template v-else-if="slot.type === 'icon'">
            <span class="preview-icon" :class="stringValue(slot.id) || slot.defaultValue"></span>
            <p class="icon-hint">{{ stringValue(slot.id) || slot.defaultValue }}</p>
          </template>
          <template v-else>
            <div v-if="listValue(slot.id).length" class="preview-list">
              <img
                v-for="url in listValue(slot.id).slice(0, 3)"
                :key="url"
                :src="url"
                alt="カバー例"
              />
              <span v-if="listValue(slot.id).length > 3" class="preview-more">
                +{{ listValue(slot.id).length - 3 }}
              </span>
            </div>
            <div v-else class="preview-empty">一覧が空のため背景は表示されません</div>
          </template>
        </div>

        <div class="resource-control">
          <label v-if="slot.type === 'image'" class="control-label">
            画像URL
            <input
              type="text"
              :value="stringValue(slot.id)"
              placeholder="https://example.com/logo.png"
              @input="update(slot.id, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label v-else-if="slot.type === 'icon'" class="control-label">
            アイコンのクラス名
            <input
              type="text"
              :value="stringValue(slot.id)"
              placeholder="i-lucide-star"
              @input="update(slot.id, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label v-else class="control-label">
            画像リスト（1行に1件）
            <textarea
              rows="4"
              :value="listValue(slot.id).join('\n')"
              placeholder="https://example.com/cover-1.png"
              @input="update(slot.id, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
          </label>

          <div v-if="slot.type !== 'icon'" class="upload-row">
            <input
              :id="`upload-${slot.id}`"
              type="file"
              accept="image/*"
              hidden
              @change="handleUpload(slot, $event)"
            />
            <label class="upload-button" :for="`upload-${slot.id}`">
              <span class="i-lucide-image"></span>
              画像をアップロード
            </label>
            <p class="upload-hint">ファイルは base64 に変換されブラウザに保存されます</p>
          </div>
        </div>

        <footer class="resource-footer">
          <span>ページ：{{ slot.page }} ・ 位置：{{ slot.position }}</span>
          <span class="resource-id">ID: {{ slot.id }}</span>
        </footer>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ResourceKey, ResourceSlotDefinition } from '../../constants/resourceSlots';
import { useResourceConfig } from '../../composables/useResourceConfig';

const route = useRoute();
const router = useRouter();
const {
  slots,
  getStringValue,
  getListValue,
  setResourceValue,
  resetResourceValue,
  exportConfig,
  importConfig,
} = useResourceConfig();

const groupId = computed(() => route.params.groupId as string);
const heroStatus = ref('');

const groupSlots = computed(() => slots.filter((slot) => slot.pageId === groupId.value));
const groupMeta = computed(() => {
  if (!groupSlots.value.length) return null;
  const [slot] = groupSlots.value;
  return { page: slot.page, pageId: slot.pageId };
});

const stringValue = (key: ResourceKey) => getStringValue(key);
const listValue = (key: ResourceKey) => getListValue(key);

const update = (key: ResourceKey, value: string) => {
  setResourceValue(key, value);
};

const reset = (key: ResourceKey) => {
  resetResourceValue(key);
};

const handleUpload = (slot: ResourceSlotDefinition, event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    if (slot.type === 'image-list') {
      const current = getListValue(slot.id);
      setResourceValue(slot.id, [result, ...current]);
    } else {
      setResourceValue(slot.id, result);
    }
    target.value = '';
  };
  reader.readAsDataURL(file);
};

const handleExport = async () => {
  try {
    const payload = exportConfig();
    await navigator.clipboard.writeText(payload);
    heroStatus.value = 'JSON をコピーしました';
  } catch {
    heroStatus.value = 'コピーに失敗しました。手動で選択してください。';
  } finally {
    setTimeout(() => {
      heroStatus.value = '';
    }, 3000);
  }
};

const handleImport = () => {
  const template = exportConfig();
  const content = window.prompt('JSON 設定を貼り付け（全リソースを上書き）', template);
  if (!content) return;
  try {
    importConfig(content);
    heroStatus.value = 'インポートしました';
  } catch {
    heroStatus.value = 'インポートに失敗しました：JSON が無効です';
  } finally {
    setTimeout(() => {
      heroStatus.value = '';
    }, 3000);
  }
};

const goBack = () => {
  router.push({ name: 'admin-resource-manager' });
};
</script>

<style scoped>
.resource-detail {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(100px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: linear-gradient(180deg, #eef2ff 0%, #ffffff 40%, #ffffff 100%);
}

.detail-hero {
  border-radius: 24px;
  padding: 20px;
  background: #0f172a;
  color: #fff;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.back-button {
  align-self: flex-start;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hero-chip {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  opacity: 0.8;
  margin: 0;
}

.detail-hero h1 {
  margin: 0;
  font-size: 1.4rem;
}

.hero-desc {
  opacity: 0.85;
  line-height: 1.5;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-status {
  font-size: 0.85rem;
  color: #bef264;
}

.primary-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  color: #fff;
}

.primary-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
}

.slot-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-card {
  border-radius: 20px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.resource-eyebrow {
  font-size: 0.85rem;
  color: #64748b;
}

.resource-desc {
  color: #475569;
  line-height: 1.5;
}

.resource-helper {
  font-size: 0.85rem;
  color: #0f172a;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  width: fit-content;
}

.resource-preview {
  border: 1px dashed rgba(148, 163, 184, 0.7);
  border-radius: 16px;
  padding: 12px;
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.resource-preview img {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 12px;
}

.preview-empty {
  font-size: 0.9rem;
  color: #94a3b8;
}

.preview-icon {
  font-size: 2rem;
  color: #0f172a;
}

.icon-hint {
  font-size: 0.8rem;
  color: #475569;
  margin-top: 6px;
}

.preview-list {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-list img {
  width: 72px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
}

.preview-more {
  font-size: 0.85rem;
  color: #475569;
}

.resource-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
  color: #0f172a;
}

.control-label input,
.control-label textarea {
  border-radius: 14px;
  border: 1px solid #cbd5f5;
  padding: 12px;
  font-size: 0.95rem;
  background: #fff;
  resize: vertical;
}

.upload-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  border: 1px dashed #94a3b8;
  padding: 8px 12px;
  color: #0f172a;
}

.upload-hint {
  font-size: 0.75rem;
  color: #94a3b8;
}

.resource-footer {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #94a3b8;
  flex-wrap: wrap;
  gap: 8px;
}

.resource-id {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
}

.reset-button {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 600;
  font-size: 0.9rem;
}

.empty-state {
  border-radius: 20px;
  padding: 24px;
  background: #fff;
  text-align: center;
  color: #475569;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}
</style>
