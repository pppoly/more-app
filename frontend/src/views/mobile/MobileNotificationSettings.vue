<template>
  <div class="notification-settings m-page">
    <ConsoleTopBar
      v-if="!isLiffClientMode"
      class="topbar"
      :title="t('mobile.emailSettings.title')"
      @back="goBack"
    />
    <section class="settings-section">
      <h2 class="m-section-title">{{ t('mobile.emailSettings.title') }}</h2>

      <div v-if="loading" class="state-card">{{ t('mobile.emailSettings.loading') }}</div>
      <div v-else class="settings-stack">
        <div class="settings-card">
          <h3 class="card-title">{{ t('mobile.emailSettings.preferences.title') }}</h3>
          <div class="preference-row">
            <div class="preference-text">
              <p class="preference-title">{{ t('mobile.emailSettings.preferences.marketingEmail.title') }}</p>
              <p class="preference-desc">{{ t('mobile.emailSettings.preferences.marketingEmail.desc') }}</p>
            </div>
            <label class="switch">
              <input
                v-model="marketingEmailDraft"
                type="checkbox"
                :disabled="saving || preferenceSaving"
                @change="toggleMarketingEmail"
              />
              <span class="switch-slider"></span>
            </label>
          </div>
          <div class="preference-row preference-row--disabled">
            <div class="preference-text">
              <p class="preference-title">{{ t('mobile.emailSettings.preferences.marketingLine.title') }}</p>
              <p class="preference-desc">{{ t('mobile.emailSettings.preferences.marketingLine.desc') }}</p>
            </div>
            <label class="switch">
              <input v-model="marketingLineDraft" type="checkbox" disabled />
              <span class="switch-slider"></span>
            </label>
          </div>
          <p class="settings-hint">{{ t('mobile.emailSettings.preferences.mandatory') }}</p>
        </div>

        <div class="section-header">
          <p class="section-title">{{ t('mobile.emailSettings.contacts.title') }}</p>
          <p class="section-hint">{{ t('mobile.emailSettings.contacts.hint') }}</p>
        </div>

        <div v-if="!lineLinked" class="notice-card">
          <h3 class="notice-title">{{ t('mobile.emailSettings.lineRequired.title') }}</h3>
          <p class="notice-body">{{ t('mobile.emailSettings.lineRequired.body') }}</p>
          <button type="button" class="primary-btn" @click="goLineLogin">
            {{ t('mobile.emailSettings.lineRequired.cta') }}
          </button>
        </div>

        <template v-else>
          <div class="email-card">
            <div class="email-card__header">
              <p class="email-card__title">{{ t('mobile.emailSettings.participant.label') }}</p>
              <span :class="statusClass(participant?.status)" class="status-chip">
                {{ statusLabel(participant?.status) }}
              </span>
            </div>
            <input
              v-model="participantDraft"
              type="email"
              :disabled="saving || participantLocked"
              placeholder="example@domain.com"
              class="email-input"
            />
            <div class="action-row">
              <button type="button" class="primary-btn" :disabled="saving" @click="saveParticipant">
                {{ participantActionLabel }}
              </button>
              <button
                v-if="participant?.status === 'unverified'"
                type="button"
                class="ghost-btn"
                :disabled="saving || !canResend(participant)"
                @click="resendParticipant"
              >
                {{ t('mobile.emailSettings.actions.resend') }}
              </button>
            </div>
            <div v-if="participant?.status === 'unverified'" class="verify-row">
              <input
                v-model="participantCode"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="4"
                placeholder="1234"
                class="code-input"
                :disabled="saving"
              />
              <button
                type="button"
                class="ghost-btn"
                :disabled="saving || participantCode.length !== 4"
                @click="verifyParticipant"
              >
                {{ t('mobile.emailSettings.actions.verify') }}
              </button>
            </div>
            <p v-if="participant?.status === 'unverified'" class="status-hint">
              {{ t('mobile.emailSettings.hints.unverified') }}
            </p>
            <p v-if="participant?.status === 'hard_bounce'" class="status-hint status-hint--error">
              {{ t('mobile.emailSettings.hints.hardBounce') }}
            </p>
          </div>

          <div v-if="showOrganizerSettings" class="settings-card">
            <label class="toggle-row">
              <input v-model="useSameEmail" type="checkbox" class="toggle-input" :disabled="saving" />
              <span>{{ t('mobile.emailSettings.shared.label') }}</span>
            </label>
            <p class="settings-hint">{{ t('mobile.emailSettings.shared.hint') }}</p>
          </div>

          <div v-if="showOrganizerSettings" class="email-card" :class="{ 'email-card--disabled': useSameEmail }">
            <div class="email-card__header">
              <p class="email-card__title">{{ t('mobile.emailSettings.organizer.label') }}</p>
              <span :class="statusClass(organizer?.status)" class="status-chip">
                {{ statusLabel(organizer?.status) }}
              </span>
            </div>
            <input
              v-model="organizerDraft"
              type="email"
              :disabled="saving || useSameEmail || organizerLocked"
              placeholder="example@domain.com"
              class="email-input"
            />
            <p v-if="useSameEmail" class="settings-hint">{{ t('mobile.emailSettings.shared.locked') }}</p>
            <div v-else class="action-row">
              <button type="button" class="primary-btn" :disabled="saving" @click="saveOrganizer">
                {{ organizerActionLabel }}
              </button>
              <button
                v-if="organizer?.status === 'unverified'"
                type="button"
                class="ghost-btn"
                :disabled="saving || !canResend(organizer)"
                @click="resendOrganizer"
              >
                {{ t('mobile.emailSettings.actions.resend') }}
              </button>
            </div>
            <div v-if="organizer?.status === 'unverified' && !useSameEmail" class="verify-row">
              <input
                v-model="organizerCode"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="4"
                placeholder="1234"
                class="code-input"
                :disabled="saving"
              />
              <button
                type="button"
                class="ghost-btn"
                :disabled="saving || organizerCode.length !== 4"
                @click="verifyOrganizer"
              >
                {{ t('mobile.emailSettings.actions.verify') }}
              </button>
            </div>
            <p v-if="organizer?.status === 'unverified'" class="status-hint">
              {{ t('mobile.emailSettings.hints.unverified') }}
            </p>
            <p v-if="organizer?.status === 'hard_bounce'" class="status-hint status-hint--error">
              {{ t('mobile.emailSettings.hints.hardBounce') }}
            </p>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import {
  fetchEmailContacts,
  fetchManagedCommunities,
  fetchNotificationPreferences,
  resendEmailVerification,
  updateEmailContact,
  updateNotificationPreference,
  verifyEmailContact,
} from '../../api/client';
import type { EmailContactStatus, EmailContactSummary, NotificationPreferences } from '../../types/api';
import { useToast } from '../../composables/useToast';
import { useI18n } from 'vue-i18n';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';

const router = useRouter();
const { user } = useAuth();
const toast = useToast();
const { t } = useI18n();

const isLiffClientMode = computed(() => isLineInAppBrowser() || isLiffClient());
const lineLinked = computed(() => Boolean(user.value?.lineUserId));
const hasManagedCommunities = ref(false);
const showOrganizerSettings = computed(() =>
  Boolean(user.value?.isOrganizer || user.value?.isAdmin || hasManagedCommunities.value),
);

const loading = ref(true);
const saving = ref(false);
const contacts = ref<EmailContactSummary | null>(null);
const participantDraft = ref('');
const organizerDraft = ref('');
const useSameEmail = ref(false);
const participantCode = ref('');
const organizerCode = ref('');
const marketingEmailDraft = ref(true);
const marketingLineDraft = ref(true);
const preferenceSaving = ref(false);

const participant = computed(() => contacts.value?.participant ?? null);
const organizer = computed(() => contacts.value?.organizer ?? null);
const participantEditing = ref(false);
const organizerEditing = ref(false);
const participantLocked = computed(() =>
  Boolean((participant.value?.email || participant.value?.pendingEmail) && !participantEditing.value),
);
const organizerLocked = computed(() =>
  Boolean((organizer.value?.email || organizer.value?.pendingEmail) && !organizerEditing.value),
);
const participantActionLabel = computed(() => {
  return participantLocked.value ? t('mobile.emailSettings.actions.update') : t('mobile.emailSettings.actions.save');
});
const organizerActionLabel = computed(() => {
  return organizerLocked.value ? t('mobile.emailSettings.actions.update') : t('mobile.emailSettings.actions.save');
});

const applyPreferences = (prefs: NotificationPreferences) => {
  marketingEmailDraft.value = prefs.marketing.email;
  marketingLineDraft.value = prefs.marketing.line;
};

const applyDraftsFromContacts = (summary: EmailContactSummary, keepToggle = false) => {
  const participantEmail = summary.participant.pendingEmail || summary.participant.email || '';
  const organizerEmail = summary.organizer.pendingEmail || summary.organizer.email || '';
  participantDraft.value = participantEmail;
  organizerDraft.value = organizerEmail;
  participantEditing.value = false;
  organizerEditing.value = false;
  if (!keepToggle) {
    useSameEmail.value =
      showOrganizerSettings.value && Boolean(participantEmail && organizerEmail && participantEmail === organizerEmail);
  }
  if (summary.participant.status !== 'unverified') participantCode.value = '';
  if (summary.organizer.status !== 'unverified') organizerCode.value = '';
};

const loadSettings = async () => {
  loading.value = true;
  try {
    const prefs = await fetchNotificationPreferences();
    applyPreferences(prefs);
  } catch (error) {
    console.error('Failed to load notification preferences', error);
    toast.show(t('mobile.emailSettings.toast.preferencesFailed'), 'error');
    loading.value = false;
    return;
  }

  try {
    const [contactsResult, communities] = await Promise.all([
      lineLinked.value ? fetchEmailContacts() : Promise.resolve(null),
      fetchManagedCommunities().catch(() => []),
    ]);
    if (contactsResult) {
      contacts.value = contactsResult;
      applyDraftsFromContacts(contactsResult);
    } else {
      contacts.value = null;
    }
    hasManagedCommunities.value = communities.length > 0;
  } catch (error) {
    console.error('Failed to load email contacts', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadSettings();
});

watch(
  () => lineLinked.value,
  (linked) => {
    if (linked) loadSettings();
  },
);

watch(participantDraft, (value) => {
  if (showOrganizerSettings.value && useSameEmail.value) organizerDraft.value = value;
});

watch(useSameEmail, (value) => {
  if (showOrganizerSettings.value && value) organizerDraft.value = participantDraft.value;
  if (showOrganizerSettings.value && value) organizerCode.value = '';
  if (showOrganizerSettings.value && value) organizerEditing.value = false;
});

watch(showOrganizerSettings, (enabled) => {
  if (!enabled) {
    useSameEmail.value = false;
    organizerCode.value = '';
    organizerEditing.value = false;
  }
});

const updateMarketingPreference = async (channel: 'email' | 'line', enabled: boolean) => {
  preferenceSaving.value = true;
  const prevEmail = marketingEmailDraft.value;
  const prevLine = marketingLineDraft.value;
  try {
    const prefs = await updateNotificationPreference({ channel, enabled, category: 'marketing' });
    applyPreferences(prefs);
    toast.show(t('mobile.emailSettings.toast.preferencesSaved'), 'success');
  } catch (error) {
    console.error('Failed to update notification preference', error);
    marketingEmailDraft.value = prevEmail;
    marketingLineDraft.value = prevLine;
    toast.show(t('mobile.emailSettings.toast.preferencesFailed'), 'error');
  } finally {
    preferenceSaving.value = false;
  }
};

const toggleMarketingEmail = () => {
  updateMarketingPreference('email', marketingEmailDraft.value);
};

const sanitizeCode = (value: string) => value.replace(/\D/g, '').slice(0, 4);

watch(participantCode, (value) => {
  const sanitized = sanitizeCode(value);
  if (sanitized !== value) participantCode.value = sanitized;
});

watch(organizerCode, (value) => {
  const sanitized = sanitizeCode(value);
  if (sanitized !== value) organizerCode.value = sanitized;
});

const canResend = (contact: EmailContactStatus | null) => {
  if (!contact || contact.status !== 'unverified') return false;
  if (!contact.resendAvailableAt) return true;
  return Date.now() >= new Date(contact.resendAvailableAt).getTime();
};

const statusLabel = (status?: string | null) => {
  if (!status) return t('mobile.emailSettings.status.none');
  return t(`mobile.emailSettings.status.${status}`);
};

const statusClass = (status?: string | null) => {
  const key = status || 'none';
  return `status-chip--${key}`;
};

const saveParticipant = async () => {
  if (participantLocked.value) {
    participantEditing.value = true;
    return;
  }
  if (!participantDraft.value.trim()) {
    toast.show(t('mobile.emailSettings.errors.missingEmail'), 'warning');
    return;
  }
  saving.value = true;
  try {
    let summary = await updateEmailContact('participant', participantDraft.value.trim());
    if (showOrganizerSettings.value && useSameEmail.value) {
      summary = await updateEmailContact('organizer', participantDraft.value.trim());
    }
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    participantCode.value = '';
    if (useSameEmail.value) organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.saved'), 'success');
  } catch (error) {
    console.error('Failed to update participant email', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    saving.value = false;
  }
};

const saveOrganizer = async () => {
  if (organizerLocked.value) {
    organizerEditing.value = true;
    return;
  }
  if (!organizerDraft.value.trim()) {
    toast.show(t('mobile.emailSettings.errors.missingEmail'), 'warning');
    return;
  }
  saving.value = true;
  try {
    const summary = await updateEmailContact('organizer', organizerDraft.value.trim());
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.saved'), 'success');
  } catch (error) {
    console.error('Failed to update organizer email', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    saving.value = false;
  }
};

const resendParticipant = async () => {
  saving.value = true;
  try {
    let summary = await resendEmailVerification('participant');
    if (showOrganizerSettings.value && useSameEmail.value && participantDraft.value.trim()) {
      summary = await updateEmailContact('organizer', participantDraft.value.trim());
    }
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    participantCode.value = '';
    if (useSameEmail.value) organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.resent'), 'success');
  } catch (error) {
    console.error('Failed to resend participant verification', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    saving.value = false;
  }
};

const resendOrganizer = async () => {
  saving.value = true;
  try {
    const summary = await resendEmailVerification('organizer');
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.resent'), 'success');
  } catch (error) {
    console.error('Failed to resend organizer verification', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    saving.value = false;
  }
};

const goLineLogin = () => {
  router.push({ name: 'auth-login', query: { redirect: '/settings/notifications' } });
};

const verifyParticipant = async () => {
  if (participantCode.value.length !== 4) {
    toast.show(t('mobile.emailSettings.errors.invalidCode'), 'warning');
    return;
  }
  saving.value = true;
  try {
    const summary = await verifyEmailContact('participant', participantCode.value);
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    participantCode.value = '';
    if (useSameEmail.value) organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.verified'), 'success');
  } catch (error) {
    console.error('Failed to verify participant email', error);
    toast.show(t('mobile.emailSettings.toast.verifyFailed'), 'error');
  } finally {
    saving.value = false;
  }
};

const verifyOrganizer = async () => {
  if (organizerCode.value.length !== 4) {
    toast.show(t('mobile.emailSettings.errors.invalidCode'), 'warning');
    return;
  }
  saving.value = true;
  try {
    const summary = await verifyEmailContact('organizer', organizerCode.value);
    contacts.value = summary;
    applyDraftsFromContacts(summary, true);
    organizerCode.value = '';
    toast.show(t('mobile.emailSettings.toast.verified'), 'success');
  } catch (error) {
    console.error('Failed to verify organizer email', error);
    toast.show(t('mobile.emailSettings.toast.verifyFailed'), 'error');
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  const back = typeof window !== 'undefined' ? window.history.state?.back : null;
  if (back) {
    router.back();
    return;
  }
  router.replace({ name: 'MobileSettings' });
};
</script>

<style scoped>
.notification-settings {
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

.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.settings-card,
.email-card,
.notice-card,
.state-card {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
}

.notice-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
}

.notice-body {
  margin: 0 0 12px;
  color: #5b6472;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.toggle-input {
  width: 18px;
  height: 18px;
}

.settings-hint {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.card-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.section-hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.preference-row:first-of-type {
  border-top: none;
}

.preference-row--disabled {
  opacity: 0.6;
}

.preference-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preference-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.preference-desc {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.switch {
  position: relative;
  display: inline-flex;
  width: 46px;
  height: 26px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  inset: 0;
  background: #e2e8f0;
  border-radius: 999px;
  transition: background 0.2s ease;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.16);
  transition: transform 0.2s ease;
}

.switch input:checked + .switch-slider {
  background: #0ea5e9;
}

.switch input:checked + .switch-slider::before {
  transform: translateX(20px);
}

.switch input:disabled + .switch-slider {
  opacity: 0.6;
  background: #e2e8f0;
}

.email-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.email-card__title {
  font-weight: 600;
  margin: 0;
}

.email-input {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  background: #f8fafc;
  box-sizing: border-box;
}

.code-input {
  flex: 1;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  letter-spacing: 0.2em;
  text-align: center;
  background: #f8fafc;
  box-sizing: border-box;
}

.email-card--disabled {
  opacity: 0.7;
}

.action-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.verify-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.primary-btn,
.ghost-btn {
  flex: 1;
  border-radius: 999px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  border: none;
}

.primary-btn {
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.6;
}

.ghost-btn {
  background: #fff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.12);
}

.status-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}

.status-chip--verified {
  background: #e6fbf1;
  color: #168a5a;
}

.status-chip--unverified {
  background: #fff4e5;
  color: #c77711;
}

.status-chip--none {
  background: #eef2f9;
  color: #5b6472;
}

.status-chip--hard_bounce {
  background: #ffe8e8;
  color: #b42318;
}

.status-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.status-hint--error {
  color: #b42318;
}
</style>
