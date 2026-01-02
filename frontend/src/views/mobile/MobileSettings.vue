<template>
  <div class="mobile-settings m-page">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" :title="t('mobile.settings.title')" @back="goBack" />
    <section class="settings-section">
      <h2 class="m-section-title">{{ t('mobile.settings.title') }}</h2>
      <div class="settings-list">
        <button class="settings-item" @click="openLanguage">
          <div>
            <p class="settings-item__label">{{ t('mobile.settings.language.label') }}</p>
            <p class="settings-item__meta">{{ t('mobile.settings.language.meta') }}</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
        <button class="settings-item" @click="openNotification">
          <div>
            <p class="settings-item__label">{{ t('mobile.settings.notifications.label') }}</p>
            <p class="settings-item__meta">{{ t('mobile.settings.notifications.meta') }}</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="m-section-title">{{ t('mobile.settings.legal.title') }}</h2>
      <div class="settings-list">
        <a class="settings-item" href="/legal/terms" target="_blank" rel="noopener">
          <div>
            <p class="settings-item__label">{{ t('mobile.settings.legal.terms.label') }}</p>
            <p class="settings-item__meta">{{ t('mobile.settings.legal.terms.meta') }}</p>
          </div>
          <span class="i-lucide-external-link"></span>
        </a>
        <a class="settings-item" href="/legal/privacy" target="_blank" rel="noopener">
          <div>
            <p class="settings-item__label">{{ t('mobile.settings.legal.privacy.label') }}</p>
            <p class="settings-item__meta">{{ t('mobile.settings.legal.privacy.meta') }}</p>
          </div>
          <span class="i-lucide-external-link"></span>
        </a>
      </div>
    </section>

    <section class="settings-section" v-if="isLoggedIn">
      <h2 class="m-section-title">{{ t('header.default') }}</h2>
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
                <p class="locale-sheet__title">{{ t('localeSheet.title') }}</p>
                <p class="locale-sheet__subtitle">{{ t('localeSheet.subtitle') }}</p>
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
                <span v-if="item.code === currentLocale" class="locale-active-chip">{{ t('localeSheet.active') }}</span>
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
import { useI18n } from 'vue-i18n';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import { APP_TARGET } from '../../config';

const router = useRouter();
const { logout, user, setUserProfile } = useAuth();
const { currentLocale, supportedLocales, setLocale } = useLocale();
const toast = useToast();
const { t } = useI18n();
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());

const isLoggedIn = computed(() => Boolean(user.value));

const openLanguage = () => {
  showLocaleSheet.value = true;
};

const openNotification = () => {
  toast.show(t('mobile.settings.toast.notificationsPending'), 'info');
};

const logoutUser = () => {
  logout();
  router.replace({ path: '/' });
};

const goBack = () => {
  const back = typeof window !== 'undefined' ? window.history.state?.back : null;
  if (back) {
    router.back();
    return;
  }
  router.replace({ name: 'MobileMe' });
};

const localeOptions = computed(() =>
  supportedLocales.map((code) => ({
    code,
    label: t(`mobile.locale.${code}`),
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
      toast.show(t('localeSheet.saved'), 'success');
    } catch (error) {
      console.error('Failed to save preferred locale', error);
      toast.show(t('localeSheet.saveFailed'), 'error');
    } finally {
      savingLocale.value = false;
    }
  } else {
    toast.show(t('localeSheet.saved'), 'success');
  }
};
</script>

<style scoped>
.mobile-settings {
  min-height: 100vh;
  background: #f5f7fb;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px calc(64px + env(safe-area-inset-bottom, 0px));
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
  box-sizing: border-box;
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
