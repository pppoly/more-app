<template>
  <div class="px-3 py-4 pb-20 space-y-4">
    <section class="bg-white rounded-2xl p-4 shadow-sm flex items-center">
      <div class="w-12 h-12 rounded-full bg-slate-200 overflow-hidden mr-3 flex-shrink-0">
        <img v-if="user.value?.avatarUrl" :src="user.value.avatarUrl" class="w-full h-full object-cover" />
        <span v-else class="w-full h-full flex items-center justify-center text-slate-500 text-sm">
          {{ userInitials }}
        </span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-slate-900 truncate">
          {{ user.value?.name || 'ゲスト' }}
        </p>
        <p class="text-[11px] text-slate-400">
          {{ currentLanguageLabel }}
        </p>
        <div
          v-if="isOrganizer.value"
          class="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] text-emerald-700"
        >
          <span class="i-lucide-badge-check mr-1"></span>認定主理人
        </div>
      </div>
    </section>

    <section class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="px-4 py-2 text-[11px] text-slate-400">我的活動</div>
      <button class="w-full px-4 py-3 flex items-center text-sm active:bg-slate-50" @click="goMyEvents">
        <span class="i-lucide-calendar-check mr-3 text-slate-500"></span>
        <span class="flex-1 text-left">我参加的活動</span>
        <span class="i-lucide-chevron-right text-slate-400 text-xs"></span>
      </button>
    </section>

    <section class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="px-4 py-2 text-[11px] text-slate-400">主理人</div>
      <button
        v-if="!isOrganizer.value"
        class="w-full px-4 py-3 flex items-center text-sm active:bg-slate-50"
        @click="goApplyOrganizer"
      >
        <span class="i-lucide-sparkles mr-3 text-slate-500"></span>
        <span class="flex-1 text-left">申請成為主理人</span>
        <span class="i-lucide-chevron-right text-slate-400 text-xs"></span>
      </button>
      <button v-else class="w-full px-4 py-3 flex items-center text-sm active:bg-slate-50" @click="goConsole">
        <span class="i-lucide-layout-dashboard mr-3 text-slate-500"></span>
        <span class="flex-1 text-left">主理人コンソール</span>
        <span class="i-lucide-chevron-right text-slate-400 text-xs"></span>
      </button>
    </section>

    <section class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="px-4 py-2 text-[11px] text-slate-400">設定</div>
      <button class="w-full px-4 py-3 flex items-center text-sm active:bg-slate-50" @click="goLanguageSettings">
        <span class="i-lucide-languages mr-3 text-slate-500"></span>
        <span class="flex-1 text-left">言語設定 / Language</span>
        <span class="i-lucide-chevron-right text-slate-400 text-xs"></span>
      </button>
      <button
        v-if="isLoggedIn"
        class="w-full px-4 py-3 flex items-center text-sm active:bg-slate-50 text-rose-500"
        @click="logoutUser"
      >
        <span class="i-lucide-log-out mr-3"></span>
        <span class="flex-1 text-left">ログアウト</span>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';

const router = useRouter();
const { user, logout } = useAuth();

const isLoggedIn = computed(() => Boolean(user.value));
const isOrganizer = computed(() => Boolean(user.value?.isOrganizer));

const userInitials = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'M');

const currentLanguageLabel = computed(() => {
  const lang = user.value?.language ?? 'ja';
  switch (lang) {
    case 'zh':
      return '中文 / Chinese';
    case 'en':
      return 'English';
    default:
      return '日本語 / Japanese';
  }
});

const goMyEvents = () => {
  router.push({ name: 'my-events' });
};

const goApplyOrganizer = () => {
  router.push({ name: 'organizer-apply' });
};

const goConsole = () => {
  router.push({ path: '/console' });
};

const goLanguageSettings = () => {
  router.push({ path: '/settings/language' });
};

const logoutUser = () => {
  logout();
  router.push({ path: '/' });
};
</script>
