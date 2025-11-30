import axios from 'axios';
import { API_BASE_URL, DEV_LOGIN_SECRET } from '../config';
import { resolveAssetUrl } from '../utils/assetUrl';
import type {
  AiUsageDetailResponse,
  AiUsageSummaryResponse,
  CommunityAnalytics,
  CommunityPortal,
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
  EventRegistrationSummary,
  EventRegistrationsSummary,
  EventSummary,
  GeneratedEventContent,
  GenerateEventCopyInput,
  ManagedCommunity,
  MockPaymentResponse,
  MyEventItem,
  OrganizerApplicationStatus,
  PricingPlan,
  PromptDefinition,
  ConsolePaymentList,
  ConsoleCommunityBalance,
  SupportedLanguagesResponse,
  RenderPromptRequest,
  CompletePromptRequest,
  EvalPromptRequest,
  StripeCheckoutResponse,
  SubscriptionResponse,
  UserProfile,
} from '../types/api';
import type { StripeOnboardResponse } from '../types/console';

export interface CommunityPortalConfig {
  theme?: string;
  layout?: string[];
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

let authToken: string | null = null;

export function setAccessToken(token: string | null) {
  authToken = token;
}

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export async function fetchEvents(): Promise<EventSummary[]> {
  const { data } = await apiClient.get<EventSummary[]>('/events');
  return data;
}

export async function fetchEventById(eventId: string): Promise<EventDetail> {
  const { data } = await apiClient.get<EventDetail>(`/events/${eventId}`);
  return data;
}

export async function fetchEventGallery(eventId: string): Promise<EventGalleryItem[]> {
  const { data } = await apiClient.get<EventGalleryItem[]>(`/events/${eventId}/gallery`);
  return data.map((item) => ({
    ...item,
    imageUrl: resolveAssetUrl(item.imageUrl),
  }));
}

export async function fetchCommunityBySlug(slug: string): Promise<CommunityPortal> {
  const { data } = await apiClient.get<CommunityPortal>(`/communities/slug/${slug}`);
  return data;
}

export async function fetchCommunityFollowStatus(communityId: string) {
  const { data } = await apiClient.get<{ following: boolean; locked?: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function followCommunity(communityId: string) {
  const { data } = await apiClient.post<{ following: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function unfollowCommunity(communityId: string) {
  const { data } = await apiClient.delete<{ following: boolean }>(`/communities/${communityId}/follow`);
  return data;
}

export async function fetchCommunityPortalConfig(communityId: string) {
  const { data } = await apiClient.get<{ communityId: string; config: CommunityPortalConfig }>(
    `/console/communities/${communityId}/portal`,
  );
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
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ imageUrl: string }>(
    `/console/communities/uploads?communityId=${communityId}&type=${type}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return data;
}

export async function startCommunityStripeOnboarding(communityId: string): Promise<StripeOnboardResponse> {
  const { data } = await apiClient.post<StripeOnboardResponse>(`/console/communities/${communityId}/stripe/onboard`, {});
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

export async function cancelMyRegistration(registrationId: string): Promise<{ registrationId: string; status: string }> {
  const { data } = await apiClient.post<{ registrationId: string; status: string }>(
    `/me/events/${registrationId}/cancel`,
    {},
  );
  return data;
}

export async function uploadMyAvatar(file: File): Promise<UserProfile> {
  const formData = new FormData();
  formData.append('avatar', file);
  const { data } = await apiClient.post<UserProfile>('/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
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
  payload: { draft: string; language?: string },
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

export async function saveEventAssistantLog(
  communityId: string,
  payload: {
    stage?: string;
    summary?: string;
    qaState?: Record<string, unknown>;
    messages: unknown;
    aiResult?: unknown;
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

export async function updateProfile(payload: { name?: string; preferredLocale?: string }): Promise<UserProfile> {
  const { data } = await apiClient.post<UserProfile>('/me/profile', payload);
  return data;
}

export async function uploadEventCovers(eventId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const { data } = await apiClient.post(`/console/events/${eventId}/covers`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as EventGalleryItem[];
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

export async function submitOrganizerApplication(payload: { reason: string; experience?: string }) {
  const { data } = await apiClient.post('/organizers/apply', payload);
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
