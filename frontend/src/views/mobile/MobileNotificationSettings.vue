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

      <div v-if="!lineLinked" class="notice-card">
        <h3 class="notice-title">{{ t('mobile.emailSettings.lineRequired.title') }}</h3>
        <p class="notice-body">{{ t('mobile.emailSettings.lineRequired.body') }}</p>
        <button type="button" class="primary-btn" @click="goLineLogin">
          {{ t('mobile.emailSettings.lineRequired.cta') }}
        </button>
      </div>

      <div v-else>
        <div v-if="loading" class="state-card">{{ t('mobile.emailSettings.loading') }}</div>
        <div v-else class="settings-stack">
          <div class="settings-card">
            <label class="toggle-row">
              <input v-model="useSameEmail" type="checkbox" class="toggle-input" :disabled="saving" />
              <span>{{ t('mobile.emailSettings.shared.label') }}</span>
            </label>
            <p class="settings-hint">{{ t('mobile.emailSettings.shared.hint') }}</p>
          </div>

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
              :disabled="saving"
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

          <div class="email-card" :class="{ 'email-card--disabled': useSameEmail }">
            <div class="email-card__header">
              <p class="email-card__title">{{ t('mobile.emailSettings.organizer.label') }}</p>
              <span :class="statusClass(organizer?.status)" class="status-chip">
                {{ statusLabel(organizer?.status) }}
              </span>
            </div>
            <input
              v-model="organizerDraft"
              type="email"
              :disabled="saving || useSameEmail"
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
            <div
              v-if="organizer?.status === 'unverified' && !useSameEmail"
              class="verify-row"
            >
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
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { fetchEmailContacts, resendEmailVerification, updateEmailContact, verifyEmailContact } from '../../api/client';
import type { EmailContactStatus, EmailContactSummary } from '../../types/api';
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

const loading = ref(true);
const saving = ref(false);
const contacts = ref<EmailContactSummary | null>(null);
const participantDraft = ref('');
const organizerDraft = ref('');
const useSameEmail = ref(false);
const participantCode = ref('');
const organizerCode = ref('');

const participant = computed(() => contacts.value?.participant ?? null);
const organizer = computed(() => contacts.value?.organizer ?? null);
const participantActionLabel = computed(() => {
  const hasEmail = Boolean(participant.value?.email || participant.value?.pendingEmail);
  return hasEmail ? t('mobile.emailSettings.actions.update') : t('mobile.emailSettings.actions.save');
});
const organizerActionLabel = computed(() => {
  const hasEmail = Boolean(organizer.value?.email || organizer.value?.pendingEmail);
  return hasEmail ? t('mobile.emailSettings.actions.update') : t('mobile.emailSettings.actions.save');
});

const applyDraftsFromContacts = (summary: EmailContactSummary, keepToggle = false) => {
  const participantEmail = summary.participant.pendingEmail || summary.participant.email || '';
  const organizerEmail = summary.organizer.pendingEmail || summary.organizer.email || '';
  participantDraft.value = participantEmail;
  organizerDraft.value = organizerEmail;
  if (!keepToggle) {
    useSameEmail.value = Boolean(participantEmail && organizerEmail && participantEmail === organizerEmail);
  }
  if (summary.participant.status !== 'unverified') participantCode.value = '';
  if (summary.organizer.status !== 'unverified') organizerCode.value = '';
};

const loadContacts = async () => {
  if (!lineLinked.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const summary = await fetchEmailContacts();
    contacts.value = summary;
    applyDraftsFromContacts(summary);
  } catch (error) {
    console.error('Failed to load email contacts', error);
    toast.show(t('mobile.emailSettings.toast.failed'), 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadContacts();
});

watch(
  () => lineLinked.value,
  (linked) => {
    if (linked) loadContacts();
  },
);

watch(participantDraft, (value) => {
  if (useSameEmail.value) organizerDraft.value = value;
});

watch(useSameEmail, (value) => {
  if (value) organizerDraft.value = participantDraft.value;
  if (value) organizerCode.value = '';
});

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
  if (!participantDraft.value.trim()) {
    toast.show(t('mobile.emailSettings.errors.missingEmail'), 'warning');
    return;
  }
  saving.value = true;
  try {
    let summary = await updateEmailContact('participant', participantDraft.value.trim());
    if (useSameEmail.value) {
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
    if (useSameEmail.value && participantDraft.value.trim()) {
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
