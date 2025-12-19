<template>
  <div class="communities-page">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" title="マイコミュニティ" @back="goBack" />
    <section class="page-head">
      <p class="page-eyebrow">私が所属するコミュニティ</p>
      <h1 class="page-title">あなたがつながっている場</h1>
      <p class="page-subtext">活動の動きやお知らせをここでまとめて確認できます。</p>
    </section>

    <section class="section">
      <div class="section-head">
        <p class="section-title">活発なコミュニティ</p>
      </div>
      <div v-if="activeCommunities.length" class="card-list">
        <article v-for="item in activeCommunities" :key="item.id" class="community-card" @click="goToCommunity(item)">
          <img v-if="item.coverImage" class="community-cover" :src="item.coverImage" alt="" />
          <div v-else class="community-cover"></div>
          <div class="community-body">
            <p class="community-name">{{ item.name }}</p>
            <p class="community-status">{{ item.statusLine || '最新の動きがここに表示されます' }}</p>
            <div class="community-meta">
              <span v-if="item.role" class="role-chip">{{ item.role }}</span>
            </div>
            <button class="cta-btn" type="button" @click.stop="goToCommunity(item)">
              {{ item.cta || 'コミュニティを見る' }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="state-card">
        <p class="state-title">最近動きのあるコミュニティがまだありません</p>
        <p class="state-text">イベントやお知らせが出るとここに表示されます。</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <p class="section-title">その他のコミュニティ</p>
        <button type="button" class="ghost-btn" @click="quietOpen = !quietOpen">
          {{ quietOpen ? '折りたたむ' : '表示する' }}
        </button>
      </div>
      <transition name="fade">
        <div v-if="quietOpen">
          <div v-if="quietCommunities.length" class="card-list card-list--quiet">
            <article
              v-for="item in quietCommunities"
              :key="item.id"
              class="community-card"
              @click="goToCommunity(item)"
            >
              <img v-if="item.coverImage" class="community-cover" :src="item.coverImage" alt="" />
              <div v-else class="community-cover"></div>
              <div class="community-body">
                <p class="community-name">{{ item.name }}</p>
                <p class="community-status">{{ item.statusLine || '更新待ちのコミュニティ' }}</p>
                <div class="community-meta">
                  <span v-if="item.role" class="role-chip">{{ item.role }}</span>
                </div>
                <button class="cta-btn" type="button" @click.stop="goToCommunity(item)">
                  {{ item.cta || 'コミュニティを見る' }}
                </button>
              </div>
            </article>
          </div>
          <div v-else class="state-card state-card--quiet">
            <p class="state-title">更新のないコミュニティはここに表示されます</p>
            <p class="state-text">動きがあれば自動で上の「活発なコミュニティ」に移動します。</p>
          </div>
        </div>
      </transition>
    </section>

    <section v-if="!activeCommunities.length && !quietCommunities.length" class="section">
      <div class="state-card">
        <p class="state-title">コミュニティに参加すると、ここで活動やお知らせをまとめて確認できます。</p>
        <p class="state-text">興味のあるコミュニティに参加して、イベント情報を受け取りましょう。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { APP_TARGET } from '../../config';

type CommunityCardItem = {
  id: string;
  name: string;
  coverImage?: string | null;
  statusLine?: string;
  role?: string;
  cta?: string;
  slug?: string;
};

const router = useRouter();

// 数据接入前保持为空，确保无 mock 数据。
const activeCommunities = ref<CommunityCardItem[]>([]);
const quietCommunities = ref<CommunityCardItem[]>([]);
const quietOpen = ref(false);
const isLiffClientMode = computed(() => isLiffClient() || APP_TARGET === 'liff');

const goBack = () => {
  router.push({ name: 'MobileMe' });
};

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
  margin-top: calc(-8px - env(safe-area-inset-top, 0px));
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 14px;
}

.page-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #64748b;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.page-subtext {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.section {
  margin-bottom: 14px;
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

.card-list--quiet .community-card {
  opacity: 0.85;
  border-color: rgba(15, 23, 42, 0.08);
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
</style>

<style scoped>
.community-card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.community-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
  object-fit: cover;
}

.community-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.community-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.community-status {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.community-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #e2e8f0;
  color: #0f172a;
}

.cta-btn {
  margin-top: 4px;
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: #0f172a;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
</style>
