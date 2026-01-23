<template>
  <div class="communities-page" data-scroll="main">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" title="マイコミュニティ" @back="goBack" />

    <section class="section">
      <div v-if="loading" class="card-list">
        <article v-for="n in 3" :key="`s-${n}`" class="community-card community-card--skeleton"></article>
      </div>
      <div v-else-if="error" class="state-card">
        <p class="state-title">コミュニティを読み込めませんでした</p>
        <p class="state-text">{{ error }}</p>
        <button class="ghost-btn" type="button" @click="loadCommunities">再読み込み</button>
      </div>
      <div v-else-if="activeCommunities.length || quietCommunities.length" class="card-list">
        <article
          v-for="item in [...activeCommunities, ...quietCommunities]"
          :key="item.id"
          class="community-card"
          @click="goToCommunity(item)"
        >
          <div class="community-avatar">
            <AppAvatar :src="item.imageUrl" :name="item.name" :size="52" :rounded="false" />
          </div>
          <div class="community-body">
            <div class="community-head">
              <p class="community-name">{{ item.name }}</p>
            </div>
            <p class="community-status">{{ formatStatus(item) }}</p>
          </div>
        </article>
      </div>
      <div v-else class="state-card">
        <p class="state-title">参加コミュニティの活動やニュース、お知らせなどが、確認できます。</p>
        <p class="state-text">興味のあるコミュニティに参加して、イベント情報を受け取りましょう。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { useScrollMemory } from '../../composables/useScrollMemory';
import { useRouter } from 'vue-router';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import { fetchMyCommunities, type MyCommunityItem } from '../../api/client';
import AppAvatar from '../../components/common/AppAvatar.vue';

type CommunityCardItem = {
  id: string;
  name: string;
  coverImage?: string | null;
  statusLine?: string;
  role?: string;
  cta?: string;
  slug?: string;
  avatarUrl?: string | null;
  imageUrl: string;
};

const router = useRouter();

const activeCommunities = ref<CommunityCardItem[]>([]);
const quietCommunities = ref<CommunityCardItem[]>([]);
const quietOpen = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const lastFetchedAt = ref(0);
const STALE_MS = 60_000;
const FOLLOW_CHANGE_KEY = 'more_my_communities_follow_change';
// できるだけネットワーク経由で取得されるデフォルト画像（無い場合は後段のフォールバックへ）
const runtimeDefaultAvatar =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/uploads/dev/default/user-avatar/2025/12/17/afe77b91-deac-4c81-975b-38eba833e9c9_orig.png`
    : '';
const apiOrigin =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/api\/v1\/?$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');
const isLiffClientMode = computed(() => isLineInAppBrowser() || isLiffClient());
useScrollMemory();

const goBack = () => {
  const back = typeof window !== 'undefined' ? window.history.state?.back : null;
  if (back) {
    router.back();
    return;
  }
  router.replace({ name: 'MobileMe' });
};

const formatStatus = (item: CommunityCardItem) => {
  if (item.statusLine && item.statusLine.trim().length) return item.statusLine;
  return '最新の動きがここに表示されます';
};

const resolveImage = (url?: string | null) => {
  if (!url) return runtimeDefaultAvatar;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${apiOrigin}${url}`;
  return url;
};

const classifyCommunities = (items: MyCommunityItem[]) => {
  const now = Date.now();
  const active: CommunityCardItem[] = [];
  const quiet: CommunityCardItem[] = [];
  items.forEach((item) => {
    const lastActive = item.lastActiveAt ? new Date(item.lastActiveAt).getTime() : null;
    const daysSinceActive = lastActive ? (now - lastActive) / (1000 * 60 * 60 * 24) : null;
    const target = daysSinceActive !== null && daysSinceActive <= 30 ? active : quiet;
    const imageUrl = resolveImage(
      (item as any).logoImageUrl ||
        item.avatarUrl ||
        (item as any).imageUrl ||
        (item as any).coverImageUrl ||
        item.coverImage ||
        runtimeDefaultAvatar,
    );
    target.push({
      id: item.id,
      name: item.name,
      slug: item.slug,
      avatarUrl: item.avatarUrl || null,
      coverImage: item.coverImage || (item as any).coverImageUrl || null,
      imageUrl: imageUrl || runtimeDefaultAvatar,
      statusLine:
        item.lastEventAt && new Date(item.lastEventAt).toString() !== 'Invalid Date'
          ? `最終更新 ${new Date(item.lastEventAt).toLocaleDateString('ja-JP')}`
          : lastActive
            ? `最終更新 ${new Date(lastActive).toLocaleDateString('ja-JP')}`
            : '',
      role: item.role ?? undefined,
    });
  });
  activeCommunities.value = active;
  quietCommunities.value = quiet;
};

const loadCommunities = async () => {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchMyCommunities();
    classifyCommunities(data);
    lastFetchedAt.value = Date.now();
  } catch (err) {
    error.value =
      (err as any)?.response?.data?.message || (err instanceof Error ? err.message : 'コミュニティ取得に失敗しました');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadCommunities();
});

onActivated(() => {
  if (!lastFetchedAt.value || loading.value) return;
  let followChanged = false;
  try {
    if (typeof window !== 'undefined') {
      const marker = Number(window.localStorage.getItem(FOLLOW_CHANGE_KEY) || 0);
      followChanged = marker > lastFetchedAt.value;
    }
  } catch (err) {
    console.warn('follow change marker read failed', err);
  }
  if (!followChanged && Date.now() - lastFetchedAt.value < STALE_MS) return;
  void loadCommunities();
});

const goToCommunity = (item: CommunityCardItem) => {
  if (item.slug) {
    router.push({ name: 'community-portal', params: { slug: item.slug } });
  }
};
</script>

<style scoped>
.communities-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px calc(72px + env(safe-area-inset-bottom, 0px)) 16px;
  padding-left: calc(16px + env(safe-area-inset-left, 0px));
  padding-right: calc(16px + env(safe-area-inset-right, 0px));
  box-sizing: border-box;
  width: 100%;
  margin: 0 auto;
  overflow-x: hidden;
}
.topbar {
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
  margin-top: 0;
}

.section {
  margin: 10px 0 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.community-card--skeleton {
  height: 160px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
  border: 0;
  box-shadow: none;
}

.state-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.state-card--quiet {
  box-shadow: none;
  background: #f8fafc;
}

.state-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.state-text {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.ghost-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  color: #0f172a;
  cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>

<style scoped>
.community-card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.community-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.community-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-fallback {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.community-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.community-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.community-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.community-status {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.role-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #e2e8f0;
  color: #0f172a;
}

.cta-btn {
  display: none;
}
</style>
