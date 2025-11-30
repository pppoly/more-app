<template>
  <section class="console-shell">
    <header class="console-header">
      <RouterLink class="logo" :to="{ name: 'console-home' }">{{ t('console.access.logo') }}</RouterLink>
      <div class="switcher" v-if="user?.isOrganizer">
        <template v-if="communities.length">
          <label>
            <span>{{ t('console.access.managing') }}</span>
            <select v-model="selectedId" @change="handleCommunityChange">
              <option v-for="community in communities" :key="community.id" :value="community.id">
                {{ community.name }}（{{ community.role === 'owner' ? t('console.access.roleOwner') : t('console.access.roleAdmin') }}）
              </option>
            </select>
          </label>
        </template>
        <template v-else>
          <span>{{ t('console.access.noCommunities') }}</span>
          <RouterLink class="primary" :to="{ name: 'console-community-create' }">{{ t('console.access.create') }}</RouterLink>
        </template>
      </div>
    </header>

    <div class="console-body">
      <div v-if="!user" class="card">
        <p>{{ t('console.access.loginRequired') }}</p>
        <RouterLink class="primary" to="/organizer/apply">{{ t('console.access.loginCta') }}</RouterLink>
      </div>
      <div v-else-if="!user.isOrganizer" class="card">
        <h3>{{ t('console.access.applyRequired') }}</h3>
        <p>{{ t('console.access.applyHint') }}</p>
        <RouterLink class="primary" to="/organizer/apply">{{ t('console.access.applyCta') }}</RouterLink>
      </div>
      <div v-else>
        <p v-if="error" class="status error">{{ error }}</p>
        <div v-if="!communities.length && !loading" class="card">
          <h3>{{ t('console.access.noManagedTitle') }}</h3>
          <p>{{ t('console.access.noManagedHint') }}</p>
          <RouterLink class="primary" :to="{ name: 'console-community-create' }">{{ t('console.access.createNew') }}</RouterLink>
        </div>
        <RouterView />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useConsoleCommunityStore } from '../../stores/consoleCommunity';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const auth = useAuth();
const router = useRouter();
const route = useRoute();
const consoleCommunity = useConsoleCommunityStore();

const user = auth.user;
const communities = consoleCommunity.communities;
const loading = consoleCommunity.loading;
const error = consoleCommunity.error;
const selectedId = ref<string | null>(consoleCommunity.activeCommunityId.value);

const init = async () => {
  if (!auth.user.value?.isOrganizer) return;
  await consoleCommunity.loadCommunities();
  consoleCommunity.ensureActiveCommunity();
  selectedId.value = consoleCommunity.activeCommunityId.value;
};

onMounted(init);

watch(
  () => consoleCommunity.activeCommunityId.value,
  (val) => {
    selectedId.value = val;
  },
);

watch(
  () => route.params.communityId,
  (communityId) => {
    if (typeof communityId === 'string' && consoleCommunity.hasCommunity(communityId)) {
      consoleCommunity.setActiveCommunity(communityId);
    }
  },
);

const handleCommunityChange = () => {
  if (!selectedId.value) return;
  consoleCommunity.setActiveCommunity(selectedId.value);
  router.push({ name: 'console-community-events', params: { communityId: selectedId.value } });
};
</script>

<style scoped>
.console-shell {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 60vh;
}
.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}
.logo {
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
}
.switcher label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}
.switcher select {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
}
.console-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.primary {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 999px;
}
.status {
  color: var(--color-subtext);
}
.error {
  color: #c53030;
}
</style>
