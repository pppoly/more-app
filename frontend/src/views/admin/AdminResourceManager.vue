<template>
  <main class="resource-overview">
    <section class="hero">
      <p class="hero-chip">资源配置 · Admin</p>
      <h1>按模块管理品牌素材</h1>
      <p class="hero-desc">
        这里罗列了所有资源分组。点击卡片进入二级页面，可为对应页面更新 Logo、图标或占位图。需要跨设备同步时，先在详情页导出 JSON。
      </p>
      <p class="hero-tip">共 {{ groups.length }} 个分组 · {{ totalSlots }} 个资源位</p>
    </section>

    <section class="group-grid">
      <article
        v-for="group in groups"
        :key="group.pageId"
        class="group-card"
      >
        <div class="group-card__head">
          <p class="group-eyebrow">页面 / 模块</p>
          <h2>{{ group.page }}</h2>
          <p class="group-count">包含 {{ group.slots.length }} 个资源位</p>
        </div>
        <ul class="group-highlights">
          <li v-for="slot in group.previewSlots" :key="slot.id">
            <span class="slot-label">{{ slot.label }}</span>
            <span class="slot-position">{{ slot.position }}</span>
          </li>
          <li v-if="group.slots.length > group.previewSlots.length" class="slot-more">
            +{{ group.slots.length - group.previewSlots.length }} 项
          </li>
        </ul>
        <button type="button" class="manage-button" @click="openGroup(group.pageId)">
          进入配置
          <span class="i-lucide-arrow-right"></span>
        </button>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useResourceConfig } from '../../composables/useResourceConfig';

const { slots } = useResourceConfig();
const router = useRouter();

const groups = computed(() => {
  const groupMap = new Map<string, { page: string; pageId: string; slots: typeof slots }>();
  slots.forEach((slot) => {
    if (!groupMap.has(slot.pageId)) {
      groupMap.set(slot.pageId, { page: slot.page, pageId: slot.pageId, slots: [] });
    }
    groupMap.get(slot.pageId)!.slots.push(slot);
  });
  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    previewSlots: group.slots.slice(0, 3),
  }));
});

const totalSlots = computed(() => slots.length);

const openGroup = (pageId: string) => {
  router.push({ name: 'admin-resource-group', params: { groupId: pageId } });
};
</script>

<style scoped>
.resource-overview {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(100px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: linear-gradient(180deg, #eef2ff 0%, #ffffff 40%, #ffffff 100%);
}

.hero {
  border-radius: 28px;
  padding: 24px;
  background: #0f172a;
  color: #fff;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.35);
}

.hero-chip {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
  margin-bottom: 6px;
}

.hero h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.hero-desc {
  opacity: 0.85;
  line-height: 1.5;
  margin-bottom: 8px;
}

.hero-tip {
  font-size: 0.85rem;
  color: #bfdbfe;
}

.group-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  border-radius: 20px;
  padding: 18px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-eyebrow {
  font-size: 0.85rem;
  color: #64748b;
}

.group-count {
  font-size: 0.9rem;
  color: #94a3b8;
}

.group-highlights {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-highlights li {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #475569;
}

.slot-label {
  font-weight: 600;
}

.slot-position {
  color: #94a3b8;
  font-size: 0.8rem;
  max-width: 50%;
  text-align: right;
}

.slot-more {
  font-size: 0.85rem;
  color: #94a3b8;
}

.manage-button {
  margin-top: 4px;
  border-radius: 999px;
  padding: 10px 14px;
  background: #0f172a;
  color: #fff;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

@media (min-width: 768px) {
  .resource-overview {
    padding-left: 32px;
    padding-right: 32px;
  }
  .group-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }
}
</style>
