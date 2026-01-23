<template>
  <div class="organizer-policy m-page">
    <ConsoleTopBar v-if="showTopBar" :title="t('organizerPayoutPolicy.title')" @back="goBack" />

    <section class="hero">
      <p class="hero-title">{{ t('organizerPayoutPolicy.title') }}</p>
      <p class="hero-time">{{ t('organizerPayoutPolicy.readTime') }}</p>
      <p class="hero-lede">{{ t('organizerPayoutPolicy.lede') }}</p>
    </section>

    <section class="policy-sections">
      <article v-for="section in sections" :key="section.key" class="policy-card">
        <div class="policy-card__head">
          <span class="policy-card__tag">{{ section.tag }}</span>
          <h2 class="policy-card__title">{{ section.title }}</h2>
        </div>
        <ul class="policy-card__list">
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>

    <section class="example-card">
      <p class="example-title">{{ t('organizerPayoutPolicy.example.title') }}</p>
      <p class="example-body">{{ t('organizerPayoutPolicy.example.body') }}</p>
    </section>

    <section class="accept-card">
      <p class="accept-title">{{ t('organizerPayoutPolicy.accept.title') }}</p>
      <label class="check-row">
        <input v-model="agreeFlow" type="checkbox" />
        <span>{{ t('organizerPayoutPolicy.accept.flow') }}</span>
      </label>
      <label class="check-row">
        <input v-model="agreeFee" type="checkbox" />
        <span>{{ t('organizerPayoutPolicy.accept.fee') }}</span>
      </label>
    </section>

    <footer class="action-footer">
      <button class="btn primary" type="button" :disabled="!canContinue || submitting" @click="handleAccept">
        {{ submitting ? t('organizerPayoutPolicy.actions.loading') : t('organizerPayoutPolicy.actions.accept') }}
      </button>
      <button class="btn ghost" type="button" @click="handleLater">
        {{ t('organizerPayoutPolicy.actions.later') }}
      </button>
      <p class="help-text">{{ t('organizerPayoutPolicy.help') }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { useToast } from '../../composables/useToast';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import {
  acceptOrganizerPayoutPolicy,
  fetchOrganizerPayoutPolicyStatus,
  startCommunityStripeOnboarding,
} from '../../api/client';

const { t, tm } = useI18n();
const router = useRouter();
const route = useRoute();
const toast = useToast();

const agreeFlow = ref(false);
const agreeFee = ref(false);
const submitting = ref(false);
const checkingStatus = ref(false);
const isLiffClientMode = computed(() => isLineInAppBrowser() || isLiffClient());
const showTopBar = computed(() => !isLiffClientMode.value);

const canContinue = computed(() => agreeFlow.value && agreeFee.value);
const returnTo = computed(() => (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''));
const nextAction = computed(() => (typeof route.query.next === 'string' ? route.query.next : ''));
const communityId = computed(() => (typeof route.query.communityId === 'string' ? route.query.communityId : ''));

const sections = computed(() => [
  {
    key: 'flow',
    tag: 'A',
    title: t('organizerPayoutPolicy.sections.flow.title'),
    items: (tm('organizerPayoutPolicy.sections.flow.items') as string[]) || [],
  },
  {
    key: 'refund',
    tag: 'B',
    title: t('organizerPayoutPolicy.sections.refund.title'),
    items: (tm('organizerPayoutPolicy.sections.refund.items') as string[]) || [],
  },
  {
    key: 'negative',
    tag: 'C',
    title: t('organizerPayoutPolicy.sections.negative.title'),
    items: (tm('organizerPayoutPolicy.sections.negative.items') as string[]) || [],
  },
  {
    key: 'responsibility',
    tag: 'D',
    title: t('organizerPayoutPolicy.sections.responsibility.title'),
    items: (tm('organizerPayoutPolicy.sections.responsibility.items') as string[]) || [],
  },
  {
    key: 'why',
    tag: 'E',
    title: t('organizerPayoutPolicy.sections.why.title'),
    items: (tm('organizerPayoutPolicy.sections.why.items') as string[]) || [],
  },
]);

const fallbackTarget = '/console/settings/payout';

const goBack = () => {
  router.back();
};

const proceed = async () => {
  if (nextAction.value === 'stripe-onboard' && communityId.value) {
    try {
      const { url } = await startCommunityStripeOnboarding(communityId.value);
      window.location.href = url;
      return;
    } catch (err) {
      toast.show(t('organizerPayoutPolicy.toast.acceptFailed'), 'error');
      return;
    }
  }
  const target = returnTo.value && returnTo.value !== route.fullPath ? returnTo.value : fallbackTarget;
  if (target === route.fullPath) return;
  router.replace(target);
};

const checkStatus = async () => {
  checkingStatus.value = true;
  try {
    const status = await fetchOrganizerPayoutPolicyStatus();
    if (status.acceptedAt) {
      await proceed();
    }
  } catch (error) {
    toast.show(t('organizerPayoutPolicy.toast.loadFailed'), 'error');
  } finally {
    checkingStatus.value = false;
  }
};

const handleAccept = async () => {
  if (!canContinue.value || submitting.value) return;
  submitting.value = true;
  try {
    await acceptOrganizerPayoutPolicy();
    await proceed();
  } catch (error) {
    toast.show(t('organizerPayoutPolicy.toast.acceptFailed'), 'error');
  } finally {
    submitting.value = false;
  }
};

const handleLater = () => {
  if (checkingStatus.value) return;
  toast.show(t('organizerPayoutPolicy.toast.requireAccept'), 'info');
};

onMounted(checkStatus);
</script>

<style scoped>
.organizer-policy {
  min-height: 100vh;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(28px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.hero {
  background: linear-gradient(135deg, #0f172a, #1e3a8a);
  color: #f8fafc;
  padding: 18px;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.hero-time {
  margin: 0;
  font-size: 12px;
  color: rgba(248, 250, 252, 0.8);
}

.hero-lede {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(248, 250, 252, 0.9);
  line-height: 1.5;
}

.policy-sections {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.policy-card {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.policy-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.policy-card__tag {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #e0f2fe;
  color: #0ea5e9;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.policy-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.policy-card__list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.example-card {
  margin-top: 14px;
  background: #fef3c7;
  border-radius: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(217, 119, 6, 0.25);
  color: #92400e;
}

.example-title {
  margin: 0 0 4px;
  font-weight: 700;
  font-size: 13px;
}

.example-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.accept-card {
  margin-top: 14px;
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.accept-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  color: #475569;
}

.check-row input {
  margin-top: 2px;
}

.action-footer {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn {
  width: 100%;
  border-radius: 999px;
  padding: 14px;
  font-size: 14px;
  font-weight: 600;
  border: none;
}

.btn.primary {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
  box-shadow: 0 12px 25px rgba(37, 99, 235, 0.25);
}

.btn.ghost {
  background: #fff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.12);
}

.btn:disabled {
  opacity: 0.55;
}

.help-text {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

@media (min-width: 768px) {
  .organizer-policy {
    max-width: 560px;
    margin: 0 auto;
  }
}
</style>
