import { sendAnalyticsEvents, AnalyticsEventInput } from '../api/client';
import { useAuth } from '../composables/useAuth';

const SESSION_KEY = 'analytics_session_id';
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 10;

let queue: AnalyticsEventInput[] = [];
let flushTimer: number | null = null;

function hasWindow() {
  return typeof window !== 'undefined';
}

function getSessionId(): string {
  if (!hasWindow()) return 'server';
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}

function scheduleFlush() {
  if (flushTimer !== null || !hasWindow()) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

export function trackEvent(eventName: string, payload?: Record<string, any>) {
  if (!eventName) return;
  const sessionId = getSessionId();
  const auth = useAuth();
  const userId = auth.user.value?.id ?? null;
  const path = hasWindow() ? window.location.pathname + window.location.search : '';
  const userAgent = hasWindow() ? window.navigator.userAgent : undefined;
  const isLiff = (() => {
    if (!hasWindow() || !userAgent) return false;
    const host = window.location.hostname || '';
    if (host.includes('miniapp.line.me') || host.includes('liff.line.me')) return true;
    const ua = userAgent.toLowerCase();
    if (ua.includes('liff') || ua.includes('miniapp')) return true;
    return /(^|\W)line(\/|\W|$)/.test(ua);
  })();

  queue.push({
    eventName,
    timestamp: new Date().toISOString(),
    sessionId,
    userId,
    path,
    isLiff,
    userAgent,
    payload: payload ?? null,
  });

  if (queue.length >= MAX_BATCH) {
    void flush();
  } else {
    scheduleFlush();
  }
}

async function flush() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  try {
    await sendAnalyticsEvents(batch);
  } catch (error) {
    // Swallow to avoid impacting UX; requeue once for a retry.
    queue.unshift(...batch.slice(0, MAX_BATCH));
    console.warn('Failed to send analytics events', error);
  }
}

if (hasWindow()) {
  window.addEventListener('beforeunload', () => {
    if (!queue.length) return;
    try {
      const body = JSON.stringify({ events: queue });
      navigator.sendBeacon?.('/api/v1/analytics/events', body);
    } catch {
      // ignore
    }
  });
}
