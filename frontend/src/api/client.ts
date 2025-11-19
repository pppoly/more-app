import axios from 'axios';
import { API_BASE_URL } from '../config';
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
  StripeCheckoutResponse,
  UserProfile,
} from '../types/api';

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

export async function devLogin(name: string, language?: string): Promise<DevLoginResponse> {
  const { data } = await apiClient.post<DevLoginResponse>('/auth/dev-login', { name, language });
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

export async function fetchMyEvents(): Promise<MyEventItem[]> {
  const { data } = await apiClient.get<MyEventItem[]>('/me/events');
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

export async function fetchPricingPlans(): Promise<PricingPlan[]> {
  const { data } = await apiClient.get<PricingPlan[]>('/console/communities/pricing-plans');
  return data;
}

export async function startCommunityStripeOnboarding(communityId: string): Promise<{ url: string }> {
  const { data } = await apiClient.post<{ url: string }>(
    `/console/communities/${communityId}/stripe/onboard`,
    {},
  );
  return data;
}

export async function subscribeCommunityPlan(
  communityId: string,
  planId: string,
): Promise<{ planId: string; subscriptionId: string | null }> {
  const { data } = await apiClient.post<{ planId: string; subscriptionId: string | null }>(
    `/console/communities/${communityId}/subscription`,
    { planId },
  );
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

export async function updateProfile(payload: { name?: string }): Promise<UserProfile> {
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
