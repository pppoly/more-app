<template>
  <div class="mobile-settings m-page">
    <section class="settings-section">
      <h2 class="m-section-title">一般設定</h2>
      <div class="settings-list">
        <button class="settings-item" @click="openLanguage">
          <div>
            <p class="settings-item__label">言語設定 / Language</p>
            <p class="settings-item__meta">表示言語を切り替える</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
        <button class="settings-item" @click="openNotification">
          <div>
            <p class="settings-item__label">通知・アプリ設定</p>
            <p class="settings-item__meta">アプリ権限と環境設定</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </div>
    </section>

    <section class="settings-section" v-if="isLoggedIn">
      <h2 class="m-section-title">アカウント</h2>
      <div class="settings-list">
        <button class="settings-item settings-item--danger" @click="logoutUser">
          <div>
            <p class="settings-item__label">ログアウト</p>
            <p class="settings-item__meta">Sign out</p>
          </div>
          <span class="i-lucide-log-out"></span>
        </button>
      </div>
    </section>

    <teleport to="body">
      <transition name="fade">
        <div v-if="showLocaleSheet" class="locale-sheet__overlay" @click.self="closeLocaleSheet">
          <div class="locale-sheet">
            <div class="locale-sheet__handle"></div>
            <div class="locale-sheet__header">
              <div>
                <p class="locale-sheet__title">选择界面语言</p>
                <p class="locale-sheet__subtitle">更换后会影响活动标题等展示顺序</p>
              </div>
              <button type="button" class="locale-sheet__close" @click="closeLocaleSheet">
                <span class="i-lucide-x"></span>
              </button>
            </div>
            <div class="locale-sheet__list">
              <button
                v-for="item in localeOptions"
                :key="item.code"
                type="button"
                class="locale-sheet__item"
                :class="{ 'locale-sheet__item--active': item.code === currentLocale }"
                :disabled="savingLocale"
                @click="selectLocale(item.code)"
              >
                <div class="locale-sheet__item-label">
                  <span class="locale-code">{{ item.code }}</span>
                  <span class="locale-name">{{ item.label }}</span>
                </div>
                <span v-if="item.code === currentLocale" class="locale-active-chip">使用中</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useLocale } from '../../composables/useLocale';
import { updateProfile } from '../../api/client';
import { useToast } from '../../composables/useToast';

const router = useRouter();
const { logout, user, setUserProfile } = useAuth();
const { currentLocale, supportedLocales, setLocale } = useLocale();
const toast = useToast();

const isLoggedIn = computed(() => Boolean(user.value));

const openLanguage = () => {
  showLocaleSheet.value = true;
};

const openNotification = () => {
  toast.show('通知設定は準備中です', 'info');
};

const logoutUser = () => {
  logout();
  router.replace({ path: '/' });
};

const localeLabelMap: Record<string, string> = {
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  'zh-tw': '繁體中文',
  vi: 'Tiếng Việt',
  ko: '한국어',
  tl: 'Tagalog',
  'pt-br': 'Português (BR)',
  ne: 'नेपाली',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
  my: 'မြန်မာစာ',
};

const localeOptions = computed(() =>
  supportedLocales.map((code) => ({
    code,
    label: localeLabelMap[code] ?? code,
  })),
);

const showLocaleSheet = ref(false);
const savingLocale = ref(false);

const closeLocaleSheet = () => {
  if (savingLocale.value) return;
  showLocaleSheet.value = false;
};

const selectLocale = async (locale: string) => {
  setLocale(locale);
  showLocaleSheet.value = false;
  if (user.value) {
    savingLocale.value = true;
    try {
      const profile = await updateProfile({ preferredLocale: locale });
      setUserProfile(profile);
      toast.show('语言已更新', 'success');
    } catch (error) {
      console.error('Failed to save preferred locale', error);
      toast.show('语言设置保存失败，请稍后重试', 'error');
    } finally {
      savingLocale.value = false;
    }
  } else {
    toast.show('Language updated', 'success');
  }
};
</script>

<style scoped>
.mobile-settings {
  min-height: 100vh;
  padding: 1.25rem 1.25rem 5rem;
  background: var(--m-color-bg, #f7f7fb);
}

.settings-section + .settings-section {
  margin-top: 1.5rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.settings-item {
  width: 100%;
  border: none;
  border-radius: 18px;
  padding: 1rem;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
}

.settings-item--danger {
  background: #fff5f5;
  color: #b91c1c;
}

.settings-item__label {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--m-color-text-primary, #111);
}

.settings-item__meta {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--m-color-text-tertiary, #666);
}

.locale-sheet__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-end;
  z-index: 9999;
}

.locale-sheet {
  width: 100%;
  background: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 0.75rem 1rem 1.25rem;
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.15);
}

.locale-sheet__handle {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.12);
  margin: 0 auto 0.75rem;
}

.locale-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.locale-sheet__title {
  font-weight: 700;
  font-size: 1rem;
  margin: 0;
}

.locale-sheet__subtitle {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.locale-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.locale-sheet__list {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.5rem;
}

.locale-sheet__item {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  text-align: left;
}

.locale-sheet__item--active {
  border-color: #0ea5e9;
  background: #e0f2fe;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.2);
}

.locale-sheet__item-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.locale-code {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 700;
}

.locale-name {
  font-size: 0.9rem;
  color: #334155;
}

.locale-active-chip {
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: #0ea5e9;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
