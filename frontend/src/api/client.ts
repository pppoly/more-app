import axios from 'axios';
import { API_BASE_URL } from '../config';
import type {
  CommunityAnalytics,
  CommunityPortal,
  ConsoleCommunityDetail,
  ConsoleEventDetail,
  ConsoleEventRegistration,
  ConsoleEventSummary,
  DevLoginResponse,
  EventDetail,
  EventGalleryItem,
  EventRegistrationSummary,
  EventSummary,
  GeneratedEventContent,
  GenerateEventCopyInput,
  ManagedCommunity,
  MockPaymentResponse,
  MyEventItem,
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
  return data;
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

export async function createMockPayment(registrationId: string): Promise<MockPaymentResponse> {
  const { data } = await apiClient.post<MockPaymentResponse>('/payments/mock', { registrationId });
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

export async function fetchConsoleEventRegistrations(
  eventId: string,
): Promise<ConsoleEventRegistration[]> {
  const { data } = await apiClient.get<ConsoleEventRegistration[]>(`/console/events/${eventId}/registrations`);
  return data;
}

export async function generateEventContent(
  payload: GenerateEventCopyInput,
): Promise<GeneratedEventContent> {
  const { data } = await apiClient.post<GeneratedEventContent>('/ai/events/generate', payload);
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
