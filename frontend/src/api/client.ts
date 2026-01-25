import axios, { AxiosHeaders } from 'axios';
import { API_BASE_URL, DEV_LOGIN_SECRET } from '../config';
import { resolveAssetUrl } from '../utils/assetUrl';
import { reportError } from '../utils/reporting';
import { setMaintenanceMode } from '../composables/useAppState';
import type {
  AiUsageDetailResponse,
  AiUsageSummaryResponse,
  AiCommunityUsage,
  CommunityAnalytics,
  CommunityPortal,
  ClassSummary,
  ClassDetail,
  ConsoleEventAssistantLog,
  EventAssistantDashboard,
  ConsoleCommunityDetail,
  ConsoleEventDetail,
  ConsoleEventRegistrationsResponse,
  ConsoleEventSummary,
  DevLoginResponse,
  EventAssistantReply,
  EventAssistantRequest,
  EventAssistantProfileDefaults,
  EventDetail,
  EventGalleryItem,
  FavoriteEventItem,
  EventRegistrationSummary,
  EventRegistrationsSummary,
  EventSummary,
  GeneratedEventContent,
  GenerateEventCopyInput,
  ManagedCommunity,
  MockPaymentResponse,
  MyEventItem,
  OrganizerApplicationStatus,
  OrganizerPayoutPolicyStatus,
  PricingPlan,
  PromptDefinition,
  ConsolePaymentList,
  ConsoleCommunityBalance,
  CommunityStripeStatusResponse,
  AdminStatsSummary,
  AdminEventReviewItem,
  AdminSettlementBatchDetailResponse,
  AdminSettlementBatchListResponse,
  AdminSettlementConfig,
  AdminNotificationTemplate,
  ConsolePaymentItem,
  SupportedLanguagesResponse,
  RenderPromptRequest,
  CompletePromptRequest,
  EvalPromptRequest,
  StripeCheckoutResponse,
  SubscriptionResponse,
  UserProfile,
  EmailContactSummary,
  CommunityTagCategory,
  AnalyticsEventResponse,
} from '../types/api';
import type { StripeOnboardResponse } from '../types/console';
export interface AnalyticsEventInput {
  eventName: string;
  timestamp?: string | Date;
  sessionId: string;
  userId?: string | null;
  path?: string | null;
  isLiff?: boolean;
  userAgent?: string | null;
  payload?: Record<string, any> | null;
}

export interface CommunityPortalConfig {
  theme?: string;
  layout?: string[];
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

let authToken: string | null = null;
let headerProvider: (() => Record<string, string>) | null = null;
let unauthorizedHandler: null | ((context: { status?: number; url?: string }) => void | Promise<void>) = null;

function buildErrorMessage(error: any) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Request failed, please try again.';
  if (status === 401) return 'ログインが必要です。もう一度ログインしてください。';
  if (status === 413) return 'アップロード内容が大きすぎます。圧縮して再試行してください。';
  return message;
}

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

export function isServerError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return typeof status === 'number' && status >= 500;
}

export function isBusinessError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return typeof status === 'number' && status < 500;
}

function normalizeError(error: any) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const url = error.config?.url;
    const message = buildErrorMessage(error);
    reportError('http:request_failed', { url, status, message });
    if (isNetworkError(error) || isServerError(error)) {
      const nonBlocking = typeof url === 'string' && url.includes('/analytics/events');
      if (!nonBlocking) {
        setMaintenanceMode(true, error);
      }
    }
    if (status === 401 && unauthorizedHandler) {
      unauthorizedHandler({ status, url });
    }
    if (status === 403) {
      try {
        const { useAuthSheets } = require('../composables/useAuthSheets');
        const sheets = useAuthSheets();
        const reason = error.response?.data?.error || 'FORBIDDEN';
        sheets.showForbiddenSheet({ reason, returnTo: undefined });
      } catch {
        // ignore sheet errors in non-UI contexts
      }
    }
    if (message && error.message !== message) {
      error.message = message;
    }
    (error as any).status = status;
    return error;
  }
  const status = (error as any)?.response?.status;
  const url = (error as any)?.config?.url;
  const message = buildErrorMessage(error);
  reportError('http:request_failed', { url, status, message });
  const wrapped = new Error(message);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  (wrapped as any).cause = error;
  (wrapped as any).status = status;
  (wrapped as any).response = (error as any)?.response;
  return wrapped;
}

interface UploadOptions {
  fieldName?: string;
  headers?: Record<string, string>;
  allowedTypes?: string[];
  maxBytes?: number;
}

async function uploadFiles<T>(path: string, files: File[], options: UploadOptions = {}): Promise<T> {
  const { fieldName = 'file', headers, allowedTypes, maxBytes } = options;
  const validFiles = files.filter((f): f is File => !!f && typeof (f as any).size === 'number');
  if (!validFiles.length) {
    throw new Error('ファイルが選択されていません');
  }
  validFiles.forEach((file) => {
    if (!file) return;
    const fileType = file?.type || '';
    if (allowedTypes && allowedTypes.length && fileType && !allowedTypes.includes(fileType)) {
      throw new Error('ファイル形式が正しくありません');
    }
    if (maxBytes && typeof file?.size === 'number' && file.size > maxBytes) {
      throw new Error('ファイルサイズが大きすぎます。圧縮して再試行してください。');
    }
  });

  const formData = new FormData();
  validFiles.forEach((file) => formData.append(fieldName, file));

  try {
    const { data } = await apiClient.post<T>(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data', ...headers },
    });
    return data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export function setAccessToken(token: string | null) {
  authToken = token;
}

export function setRequestHeaderProvider(provider: () => Record<string, string>) {
  headerProvider = provider;
}

export function onUnauthorized(handler: (context: { status?: number; url?: string }) => void | Promise<void>) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers ?? {});
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (headerProvider) {
    const extra = headerProvider();
    Object.entries(extra).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }
  config.headers = headers;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeError(error)),
);

export async function fetchEvents(): Promise<EventSummary[]> {
  const { data } = await apiClient.get<EventSummary[]>('/events');
  return data;
}

export async function fetchEventById(eventId: string): Promise<EventDetail> {
  const { data } = await apiClient.get<EventDetail>(`/events/${eventId}`);
  return data;
}

export async function fetchEventFollowStatus(eventId: string) {
  const { data } = await apiClient.get<{ following: boolean }>(`/events/${eventId}/follow`);
  return data;
}

export async function fetchEventGallery(eventId: string): Promise<EventGalleryItem[]> {
  const { data } = await apiClient.get<EventGalleryItem[]>(`/events/${eventId}/gallery`);
  return data.map((item) => ({
    ...item,
    imageUrl: resolveAssetUrl(item.imageUrl),
  }));
}

export async function followEvent(eventId: string) {
  const { data } = await apiClient.post<{ following: boolean }>(`/events/${eventId}/follow`);
  return data;
}

export async function unfollowEvent(eventId: string) {
  const { data } = await apiClient.delete<{ following: boolean }>(`/events/${eventId}/follow`);
  return data;
}

export async function fetchCommunityBySlug(slug: string): Promise<CommunityPortal> {
  const { data } = await apiClient.get<CommunityPortal>(`/communities/slug/${slug}`);
  return data;
}

export async function fetchCommunityFollowStatus(communityId: string) {
  const { data } = await apiClient.get<{ following: boolean; locked?: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function fetchCommunityClasses(communityId: string): Promise<ClassSummary[]> {
  const { data } = await apiClient.get<ClassSummary[]>(`/communities/${communityId}/classes`);
  return data;
}

export async function fetchClassDetail(classId: string): Promise<ClassDetail> {
  const { data } = await apiClient.get<ClassDetail>(`/classes/${classId}`);
  return data;
}

export async function createClassRegistration(classId: string, lessonId: string) {
  const { data } = await apiClient.post<{ registrationId: string; status: string; paymentStatus: string; paymentRequired: boolean; amount: number }>(
    `/classes/${classId}/registrations`,
    { lessonId },
  );
  return data;
}

export async function followCommunity(communityId: string) {
  const { data } = await apiClient.post<{ following: boolean; locked?: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function unfollowCommunity(communityId: string) {
  const { data } = await apiClient.delete<{ following: boolean; locked?: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function fetchCommunityPortalConfig(communityId: string) {
  const { data } = await apiClient.get<{ communityId: string; config: CommunityPortalConfig }>(
    `/console/communities/${communityId}/portal`,
  );
  return data;
}

export async function fetchCommunityTags(): Promise<CommunityTagCategory[]> {
  const { data } = await apiClient.get<CommunityTagCategory[]>(`/console/community-tags`);
  return data;
}

export async function fetchMyFavoriteEvents(): Promise<FavoriteEventItem[]> {
  const { data } = await apiClient.get<FavoriteEventItem[]>(`/me/favorites`);
  return data;
}

export async function updateCommunityPortalConfig(communityId: string, payload: CommunityPortalConfig) {
  const { data } = await apiClient.patch<{ communityId: string; config: CommunityPortalConfig }>(
    `/console/communities/${communityId}/portal`,
    payload,
  );
  return data;
}

export async function uploadCommunityAsset(
  communityId: string,
  file: File,
  type: 'cover' | 'logo',
): Promise<{ imageUrl: string }> {
  if (!communityId) {
    throw new Error('communityId is required to upload assets');
  }
  const data = await uploadFiles<{ imageUrl: string }>(
    `/console/communities/uploads?communityId=${communityId}&type=${type}`,
    [file],
    { fieldName: 'file', allowedTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  );
  return data;
}

export async function startCommunityStripeOnboarding(communityId: string): Promise<StripeOnboardResponse> {
  const { data } = await apiClient.post<StripeOnboardResponse>(`/console/communities/${communityId}/stripe/onboard`, {});
  return data;
}

export async function createCommunityStripeLoginLink(communityId: string): Promise<StripeOnboardResponse> {
  const { data } = await apiClient.post<StripeOnboardResponse>(`/console/communities/${communityId}/stripe/login`, {});
  return data;
}

export async function devLogin(name: string, language?: string): Promise<DevLoginResponse> {
  const payload: { name: string; language?: string; secret?: string } = { name };
  if (language) {
    payload.language = language;
  }
  if (DEV_LOGIN_SECRET) {
    payload.secret = DEV_LOGIN_SECRET;
  }
  const { data } = await apiClient.post<DevLoginResponse>('/auth/dev-login', payload);
  return data;
}

export async function lineLiffLogin(payload: {
  idToken: string;
  displayName?: string | null;
  pictureUrl?: string | null;
}): Promise<DevLoginResponse> {
  const { data } = await apiClient.post<DevLoginResponse>('/auth/line/liff-login', payload);
  return data;
}

export async function lineLiffTokenLogin(payload: {
  idToken?: string;
  accessToken?: string;
  displayName?: string | null;
  pictureUrl?: string | null;
}): Promise<DevLoginResponse> {
  const { data } = await apiClient.post<DevLoginResponse>('/auth/line/liff', payload);
  return data;
}

export async function lineLiffProfileLogin(payload: {
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
}): Promise<DevLoginResponse> {
  const { data } = await apiClient.post<DevLoginResponse>('/auth/line/liff-profile', payload, {
    headers: { 'X-LIFF-ENTRY': '1' },
  });
  return data;
}

export async function sendAnalyticsEvents(events: AnalyticsEventInput[]) {
  if (!events.length) return { success: true, stored: 0 };
  const { data } = await apiClient.post<AnalyticsEventResponse>('/analytics/events', { events });
  return data;
}

export async function fetchMe(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>('/auth/me');
  return data;
}

export async function createRegistration(
  eventId: string,
  payload: { ticketTypeId?: string; formAnswers?: unknown },
): Promise<EventRegistrationSummary> {
  const { data } = await apiClient.post<EventRegistrationSummary>(
    `/events/${eventId}/registrations`,
    payload,
  );
  return data;
}

export async function checkinRegistration(
  eventId: string,
  registrationId: string,
): Promise<{ registrationId: string; status: string }> {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/console/events/${eventId}/checkins`,
    { registrationId },
  );
  return data;
}

export async function fetchMyEvents(): Promise<MyEventItem[]> {
  const { data } = await apiClient.get<MyEventItem[]>('/me/events');
  return data;
}

export interface MyCommunityItem {
  id: string;
  name: string;
  slug: string;
  role?: string | null;
  lastActiveAt?: string | null;
  avatarUrl?: string | null;
  lastEventAt?: string | null;
  coverImage?: string | null;
  coverImageUrl?: string | null;
}

export async function fetchMyCommunities(): Promise<MyCommunityItem[]> {
  const { data } = await apiClient.get<MyCommunityItem[]>('/me/communities');
  return data;
}

export async function cancelMyRegistration(registrationId: string): Promise<{ registrationId: string; status: string }> {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/me/events/${registrationId}/cancel`,
    {},
  );
  return data;
}

export async function uploadMyAvatar(file: File): Promise<UserProfile> {
  return uploadFiles<UserProfile>('/me/avatar', [file], {
    fieldName: 'avatar',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
  });
}

export async function createMockPayment(registrationId: string): Promise<MockPaymentResponse> {
  const { data } = await apiClient.post<MockPaymentResponse>('/payments/mock', { registrationId });
  return data;
}

export async function createStripeCheckout(registrationId: string): Promise<StripeCheckoutResponse> {
  const { data } = await apiClient.post<StripeCheckoutResponse>('/payments/stripe/checkout', {
    registrationId,
  });
  return data;
}

export async function confirmStripeCheckoutSession(sessionId: string): Promise<{
  paymentId: string;
  registrationId: string | null;
  status: string;
}> {
  const { data } = await apiClient.post<{
    paymentId: string;
    registrationId: string | null;
    status: string;
  }>('/payments/stripe/confirm', { sessionId });
  return data;
}

// Admin: AI usage summary
export async function fetchAdminAiUsageSummary(): Promise<AiUsageSummaryResponse> {
  const { data } = await apiClient.get<AiUsageSummaryResponse>('/admin/ai/usage-summary');
  return data;
}

// Admin: Prompts
export async function fetchAdminPrompts(): Promise<PromptDefinition[]> {
  const { data } = await apiClient.get<PromptDefinition[]>('/ai/prompts');
  return data;
}

export async function fetchCommunityPayments(
  communityId: string,
  params?: { page?: number; pageSize?: number; eventId?: string; status?: string },
): Promise<ConsolePaymentList> {
  const { data } = await apiClient.get<ConsolePaymentList>(`/console/communities/${communityId}/payments`, {
    params,
  });
  return data;
}

export async function fetchCommunityBalance(
  communityId: string,
  params?: { period?: 'month' | 'all' },
): Promise<ConsoleCommunityBalance> {
  const { data } = await apiClient.get<ConsoleCommunityBalance>(`/console/communities/${communityId}/balance`, {
    params,
  });
  return data;
}

export async function refreshCommunityStripeStatus(communityId: string): Promise<CommunityStripeStatusResponse> {
  const { data } = await apiClient.post<CommunityStripeStatusResponse>(
    `/console/communities/${communityId}/stripe/sync`,
  );
  return data;
}

export async function refundPayment(
  paymentId: string,
  payload?: { amount?: number; reason?: string },
): Promise<{ refundId: string; status: string }> {
  const { data } = await apiClient.post<{ refundId: string; status: string }>(
    `/console/payments/${paymentId}/refund`,
    payload ?? {},
  );
  return data;
}

export async function decideRefundRequest(
  requestId: string,
  payload: { decision: 'approve_full' | 'approve_partial' | 'reject'; amount?: number; reason?: string },
): Promise<{ requestId: string; status: string; approvedAmount?: number; refundId?: string }> {
  const { data } = await apiClient.post<{ requestId: string; status: string; approvedAmount?: number; refundId?: string }>(
    `/console/refund-requests/${requestId}/decision`,
    payload,
  );
  return data;
}

export async function fetchPricingPlans(): Promise<PricingPlan[]> {
  const { data } = await apiClient.get<PricingPlan[]>('/console/communities/pricing-plans');
  return data;
}

export async function subscribeCommunityPlan(
  communityId: string,
  planId: string,
): Promise<SubscriptionResponse> {
  const { data } = await apiClient.post<SubscriptionResponse>(`/console/communities/${communityId}/subscription`, {
    planId,
  });
  return data;
}

export async function extractEventDraft(
  communityId: string,
  payload: { draft: string; language?: string; urls?: string[]; imageUrls?: string[] },
): Promise<any> {
  const { data } = await apiClient.post<any>(`/console/communities/${communityId}/event-draft/extract`, payload, {
    timeout: 45000,
  });
  return data;
}

export async function fetchManagedCommunities(): Promise<ManagedCommunity[]> {
  const { data } = await apiClient.get<ManagedCommunity[]>('/console/communities');
  return data;
}

export async function fetchCommunityAnalytics(communityId: string): Promise<CommunityAnalytics> {
  const { data } = await apiClient.get<CommunityAnalytics>(`/console/communities/${communityId}/analytics`);
  return data;
}

export async function fetchConsoleClasses(): Promise<ClassSummary[]> {
  const { data } = await apiClient.get<ClassSummary[]>('/console/classes');
  return data;
}

export async function createConsoleClass(payload: {
  title: string;
  description?: string;
  locationName?: string;
  priceYenPerLesson: number;
  defaultCapacity?: number | null;
}): Promise<ClassSummary> {
  const { data } = await apiClient.post<ClassSummary>('/console/classes', payload);
  return data;
}

export async function updateConsoleClass(classId: string, payload: Partial<{
  title: string;
  description?: string | null;
  locationName?: string | null;
  priceYenPerLesson?: number;
  defaultCapacity?: number | null;
  status?: string;
}>): Promise<ClassSummary> {
  const { data } = await apiClient.patch<ClassSummary>(`/console/classes/${classId}`, payload);
  return data;
}

export async function uploadClassCover(classId: string, file: File): Promise<{ imageUrl: string }> {
  if (!classId) {
    throw new Error('classId is required to upload cover');
  }
  const data = await uploadFiles<{ imageUrl: string }>(`/console/classes/${classId}/cover`, [file], {
    fieldName: 'file',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
  });
  return data;
}

export async function deleteConsoleClass(classId: string) {
  const { data } = await apiClient.delete(`/console/classes/${classId}`);
  return data;
}

export async function batchCreateLessons(classId: string, lessons: Array<{ startAt: string; endAt?: string; capacity?: number | null; }>) {
  const { data } = await apiClient.post(`/console/classes/${classId}/lessons/batch`, { lessons });
  return data;
}

export async function cancelLesson(lessonId: string) {
  const { data } = await apiClient.patch(`/console/lessons/${lessonId}/cancel`, {});
  return data;
}

export async function deleteLesson(lessonId: string) {
  const { data } = await apiClient.delete(`/console/lessons/${lessonId}`);
  return data;
}

export async function fetchLessonRegistrations(lessonId: string) {
  const { data } = await apiClient.get(`/console/lessons/${lessonId}/registrations`);
  return data;
}

export async function fetchLessonPaymentSummary(lessonId: string) {
  const { data } = await apiClient.get(`/console/lessons/${lessonId}/payments/summary`);
  return data;
}

export async function createConsoleCommunity(payload: any): Promise<ConsoleCommunityDetail> {
  const { data } = await apiClient.post<ConsoleCommunityDetail>('/console/communities', payload);
  return data;
}

export async function fetchConsoleCommunity(communityId: string): Promise<ConsoleCommunityDetail> {
  const { data } = await apiClient.get<ConsoleCommunityDetail>(`/console/communities/${communityId}`);
  return data;
}

export async function updateConsoleCommunity(
  communityId: string,
  payload: any,
): Promise<ConsoleCommunityDetail> {
  const { data } = await apiClient.patch<ConsoleCommunityDetail>(`/console/communities/${communityId}`, payload);
  return data;
}

export async function fetchConsoleCommunityEvents(
  communityId: string,
): Promise<ConsoleEventSummary[]> {
  const { data } = await apiClient.get<ConsoleEventSummary[]>(`/console/communities/${communityId}/events`);
  return data;
}

export async function fetchEventAssistantLogs(
  communityId: string,
): Promise<ConsoleEventAssistantLog[]> {
  const { data } = await apiClient.get<ConsoleEventAssistantLog[]>(
    `/console/communities/${communityId}/event-assistant/logs`,
  );
  return data;
}

export async function fetchEventAssistantLog(
  communityId: string,
  logId: string,
): Promise<ConsoleEventAssistantLog> {
  const { data } = await apiClient.get<ConsoleEventAssistantLog>(
    `/console/communities/${communityId}/event-assistant/logs/${logId}`,
  );
  return data;
}

export async function saveEventAssistantLog(
  communityId: string,
  payload: {
    stage?: string;
    summary?: string;
    qaState?: Record<string, unknown>;
    messages: unknown;
    aiResult?: unknown;
    status?: string;
    promptVersion?: string | null;
    turnCount?: number | null;
    language?: string | null;
    meta?: Record<string, unknown> | null;
    logId?: string | null;
  },
): Promise<ConsoleEventAssistantLog> {
  const { data } = await apiClient.post<ConsoleEventAssistantLog>(
    `/console/communities/${communityId}/event-assistant/logs`,
    payload,
  );
  return data;
}

export async function createConsoleEvent(communityId: string, payload: any): Promise<ConsoleEventDetail> {
  const { data } = await apiClient.post<ConsoleEventDetail>(`/console/communities/${communityId}/events`, payload);
  return data;
}

export async function fetchConsoleEvent(eventId: string): Promise<ConsoleEventDetail> {
  const { data } = await apiClient.get<ConsoleEventDetail>(`/console/events/${eventId}`);
  return data;
}

export async function updateConsoleEvent(eventId: string, payload: any): Promise<ConsoleEventDetail> {
  const { data } = await apiClient.patch<ConsoleEventDetail>(`/console/events/${eventId}`, payload);
  return data;
}

export async function generateEventContent(
  payload: GenerateEventCopyInput,
): Promise<GeneratedEventContent> {
  const { data } = await apiClient.post<GeneratedEventContent>('/ai/events/generate', payload);
  return data;
}

export async function requestEventAssistantReply(
  payload: EventAssistantRequest,
): Promise<EventAssistantReply> {
  const { data } = await apiClient.post<EventAssistantReply>('/ai/events/assistant', payload, {
    timeout: 60000,
  });
  return data;
}

export async function fetchAssistantDashboard(
  communityId: string,
): Promise<EventAssistantDashboard> {
  const { data } = await apiClient.get<EventAssistantDashboard>(
    `/console/communities/${communityId}/event-assistant/dashboard`,
  );
  return data;
}

export async function fetchAssistantProfileDefaults(): Promise<EventAssistantProfileDefaults> {
  const { data } = await apiClient.get<EventAssistantProfileDefaults>('/ai/events/profile-defaults');
  return data;
}

export async function sendEmailLoginCode(email: string): Promise<void> {
  await apiClient.post('/auth/email/send-code', { email });
}

export async function verifyEmailLoginCode(email: string, code: string): Promise<{ accessToken: string; user: UserProfile }> {
  const { data } = await apiClient.post<{ accessToken: string; user: UserProfile }>('/auth/email/verify', { email, code });
  return data;
}

export async function updateProfile(payload: {
  name?: string;
  preferredLocale?: string;
  email?: string;
}): Promise<UserProfile> {
  const { data } = await apiClient.post<UserProfile>('/me/profile', payload);
  return data;
}

export async function fetchEmailContacts(): Promise<EmailContactSummary> {
  const { data } = await apiClient.get<EmailContactSummary>('/me/email/status');
  return data;
}

export async function updateEmailContact(
  role: 'participant' | 'organizer',
  email: string,
): Promise<EmailContactSummary> {
  const { data } = await apiClient.post<EmailContactSummary>(`/me/email/${role}`, { email });
  return data;
}

export async function resendEmailVerification(role: 'participant' | 'organizer'): Promise<EmailContactSummary> {
  const { data } = await apiClient.post<EmailContactSummary>(`/me/email/${role}/resend`);
  return data;
}

export async function verifyEmailContact(
  role: 'participant' | 'organizer',
  code: string,
): Promise<EmailContactSummary> {
  const { data } = await apiClient.post<EmailContactSummary>('/me/email/verify', { role, code });
  return data;
}

export async function uploadEventCovers(eventId: string, files: File[]) {
  const sanitized = files.filter((f): f is File => !!f && typeof f.size === 'number');
  if (!sanitized.length) {
    throw new Error('ファイルが選択されていません');
  }
  const data = await uploadFiles<EventGalleryItem[]>(`/console/events/${eventId}/covers`, sanitized, {
    fieldName: 'files',
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    maxBytes: 10 * 1024 * 1024,
  });
  return data;
}

export async function deleteEventCover(eventId: string, coverId: string) {
  const { data } = await apiClient.delete(`/console/events/${eventId}/covers/${coverId}`);
  return data as EventGalleryItem[];
}

export async function fetchEventRegistrationsSummary(eventId: string): Promise<EventRegistrationsSummary> {
  const { data } = await apiClient.get<EventRegistrationsSummary>(
    `/console/events/${eventId}/registrations/summary`,
  );
  return data;
}

export async function fetchEventRegistrations(
  eventId: string,
): Promise<ConsoleEventRegistrationsResponse> {
  const { data } = await apiClient.get<ConsoleEventRegistrationsResponse>(`/console/events/${eventId}/registrations`);
  return data;
}

export async function exportEventRegistrationsCsv(eventId: string): Promise<Blob> {
  const { data } = await apiClient.get(`/console/events/${eventId}/registrations/export`, {
    params: { format: 'csv' },
    responseType: 'blob',
  });
  return data;
}

export async function approveEventRegistration(eventId: string, registrationId: string) {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/console/events/${eventId}/registrations/${registrationId}/approve`,
  );
  return data;
}

export async function rejectEventRegistration(eventId: string, registrationId: string) {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/console/events/${eventId}/registrations/${registrationId}/reject`,
  );
  return data;
}

export async function cancelEventRegistration(
  eventId: string,
  registrationId: string,
  payload: { reason?: string } = {},
) {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/console/events/${eventId}/registrations/${registrationId}/cancel`,
    payload,
  );
  return data;
}

export async function cancelConsoleEvent(eventId: string, payload: { reason?: string; notify?: boolean } = {}) {
  const { data } = await apiClient.post<{ eventId: string; status: string; refunds?: any }>(
    `/console/events/${eventId}/cancel`,
    payload,
  );
  return data;
}

export async function fetchMyOrganizerApplication(): Promise<OrganizerApplicationStatus> {
  const { data } = await apiClient.get<OrganizerApplicationStatus>('/organizers/me/application');
  return data;
}

export async function submitOrganizerApplication(payload: { reason: string; contact: string; experience?: string }) {
  const { data } = await apiClient.post('/organizers/apply', payload);
  return data;
}

export async function fetchOrganizerPayoutPolicyStatus(): Promise<OrganizerPayoutPolicyStatus> {
  const { data } = await apiClient.get<OrganizerPayoutPolicyStatus>('/organizer/payout-policy');
  return data;
}

export async function acceptOrganizerPayoutPolicy(): Promise<OrganizerPayoutPolicyStatus> {
  const { data } = await apiClient.post<OrganizerPayoutPolicyStatus>('/organizer/payout-policy/accept');
  return data;
}

export async function fetchAiUsageSummary(): Promise<AiUsageSummaryResponse> {
  const { data } = await apiClient.get<AiUsageSummaryResponse>('/admin/ai/usage-summary');
  return data;
}

export async function fetchAiUsageDetail(moduleId: string): Promise<AiUsageDetailResponse> {
  const { data } = await apiClient.get<AiUsageDetailResponse>(`/admin/ai/usage/${moduleId}`);
  return data;
}

export async function fetchCommunityAiUsage(communityId: string): Promise<AiCommunityUsage> {
  const { data } = await apiClient.get<AiCommunityUsage>(`/console/ai/communities/${communityId}/usage`);
  return data;
}

export async function fetchAdminEventReviews(): Promise<AdminEventReviewItem[]> {
  const { data } = await apiClient.get<AdminEventReviewItem[]>('/admin/events/reviews');
  return data;
}

export async function fetchAdminStats(): Promise<AdminStatsSummary> {
  const { data } = await apiClient.get<AdminStatsSummary>('/admin/stats');
  return data;
}

export async function fetchAdminNotificationTemplates(): Promise<AdminNotificationTemplate[]> {
  const { data } = await apiClient.get<AdminNotificationTemplate[]>('/admin/notifications/templates');
  return data;
}

export async function updateAdminNotificationTemplate(
  type: string,
  enabled: boolean,
): Promise<AdminNotificationTemplate> {
  const { data } = await apiClient.put<AdminNotificationTemplate>(`/admin/notifications/templates/${type}`, { enabled });
  return data;
}

export async function adminApproveEvent(eventId: string): Promise<{ eventId: string; status: string }> {
  const { data } = await apiClient.post<{ eventId: string; status: string }>(`/admin/events/${eventId}/approve`);
  return data;
}

export async function adminRejectEvent(
  eventId: string,
  reason?: string,
): Promise<{ eventId: string; status: string; reason?: string | null }> {
  const { data } = await apiClient.post<{ eventId: string; status: string; reason?: string | null }>(
    `/admin/events/${eventId}/reject`,
    { reason },
  );
  return data;
}

export async function adminCloseEvent(eventId: string): Promise<{ eventId: string; status: string }> {
  const { data } = await apiClient.post<{ eventId: string; status: string }>(`/admin/events/${eventId}/close`);
  return data;
}

export async function adminCancelEvent(eventId: string, reason?: string): Promise<{ eventId: string; status: string }> {
  const { data } = await apiClient.post<{ eventId: string; status: string }>(`/admin/events/${eventId}/cancel`, {
    reason,
  });
  return data;
}

export async function fetchAdminEvents(params?: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: any[]; total?: number; page?: number; pageSize?: number }> {
  const { data } = await apiClient.get('/admin/events', { params });
  return data;
}

export async function fetchAdminPayments(params?: {
  communityId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<ConsolePaymentList> {
  const { data } = await apiClient.get<ConsolePaymentList>('/admin/payments', { params });
  return data;
}

export async function adminRefundPayment(
  paymentId: string,
  payload?: { amount?: number; reason?: string },
): Promise<{ refundId: string; status: string }> {
  const { data } = await apiClient.post<{ refundId: string; status: string }>(
    `/admin/payments/ops/${paymentId}/refund`,
    payload ?? {},
  );
  return data;
}

export async function adminDiagnosePayment(paymentId: string): Promise<{ paymentId: string; intentStatus: string; localStatus: string }> {
  const { data } = await apiClient.post<{ paymentId: string; intentStatus: string; localStatus: string }>(
    `/admin/payments/ops/${paymentId}/diagnose`,
  );
  return data;
}

export async function fetchAdminSettlementConfig(): Promise<AdminSettlementConfig> {
  const { data } = await apiClient.get<AdminSettlementConfig>('/admin/settlements/config');
  return data;
}

export async function fetchAdminSettlementBatches(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminSettlementBatchListResponse> {
  const { data } = await apiClient.get<AdminSettlementBatchListResponse>('/admin/settlements/batches', { params });
  return data;
}

export async function fetchAdminSettlementBatch(batchId: string): Promise<AdminSettlementBatchDetailResponse> {
  const { data } = await apiClient.get<AdminSettlementBatchDetailResponse>(`/admin/settlements/batches/${batchId}`);
  return data;
}

export async function adminRunSettlement(payload?: {
  periodFrom?: string;
  periodTo?: string;
}): Promise<{ batchId: string; status: string }> {
  const { data } = await apiClient.post<{ batchId: string; status: string }>(`/admin/settlements/run`, payload ?? {});
  return data;
}

export async function adminRetrySettlementBatch(batchId: string): Promise<{ batchId: string; status: string }> {
  const { data } = await apiClient.post<{ batchId: string; status: string }>(`/admin/settlements/batches/${batchId}/retry`);
  return data;
}

export async function fetchAdminSettlementBatchCsv(batchId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await apiClient.get(`/admin/settlements/batches/${batchId}/export`, {
    params: { format: 'csv' },
    responseType: 'blob',
  });
  const disposition = res.headers?.['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `settlement.${batchId}.csv`;
  return { blob: res.data as Blob, filename };
}

export async function fetchAiPrompts() {
  const { data } = await apiClient.get<PromptDefinition[]>('/ai/prompts');
  return data;
}

export async function saveAiPrompts(prompts: PromptDefinition[]) {
  const { data } = await apiClient.post<PromptDefinition[]>('/ai/prompts', prompts);
  return data;
}

export async function fetchSupportedLanguages() {
  const { data } = await apiClient.get<SupportedLanguagesResponse>('/ai/languages');
  return data;
}

export async function renderPrompt(payload: RenderPromptRequest) {
  const { data } = await apiClient.post('/ai/render', payload);
  return data;
}

export async function completePrompt(payload: CompletePromptRequest) {
  const { data } = await apiClient.post('/ai/complete', payload);
  return data;
}

export async function translateText(payload: { sourceLang: string; targetLangs: string[]; items: any[] }) {
  const { data } = await apiClient.post('/ai/translate', payload);
  return data;
}

export async function evalPrompt(payload: EvalPromptRequest) {
  const { data } = await apiClient.post('/ai/eval', payload);
  return data;
}
export async function adminListUsers(params?: {
  status?: string;
  isOrganizer?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: Array<{
    id: string;
    name?: string | null;
    email?: string | null;
    isAdmin?: boolean;
    isOrganizer?: boolean;
    status?: string;
    createdAt: string;
  }>;
  total?: number;
  page?: number;
  pageSize?: number;
}> {
  const { data } = await apiClient.get('/admin/users', { params });
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: params?.page, pageSize: params?.pageSize };
  }
  return data;
}

export async function adminUpdateUserStatus(userId: string, status: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.patch<{ id: string; status: string }>(`/admin/users/${userId}/status`, { status });
  return data;
}

export async function adminUpdateUserOrganizer(
  userId: string,
  isOrganizer: boolean,
): Promise<{ id: string; isOrganizer: boolean }> {
  const { data } = await apiClient.patch<{ id: string; isOrganizer: boolean }>(`/admin/users/${userId}/organizer`, {
    isOrganizer,
  });
  return data;
}

export async function adminListCommunities(params?: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    pricingPlanId?: string | null;
    stripeAccountId?: string | null;
    stripeAccountOnboarded?: boolean | null;
    createdAt: string;
  }>;
  total?: number;
  page?: number;
  pageSize?: number;
}> {
  const { data } = await apiClient.get('/admin/communities', { params });
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: params?.page, pageSize: params?.pageSize };
  }
  return data;
}

export async function adminUpdateCommunityStatus(
  communityId: string,
  status: string,
): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.patch<{ id: string; status: string }>(
    `/admin/communities/${communityId}/status`,
    { status },
  );
  return data;
}
