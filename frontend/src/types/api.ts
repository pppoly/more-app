export interface LocalizedContent {
  original?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id: string;
  name: string;
  language?: string | null;
  preferredLocale?: string | null;
  prefecture?: string | null;
  avatarUrl?: string | null;
  isOrganizer?: boolean;
  isAdmin?: boolean;
}

export interface AnalyticsEventResponse {
  success: boolean;
  stored: number;
}

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
  logoImageUrl?: string | null;
}

export interface CommunityTag {
  id: string;
  categoryId: string;
  nameJa: string;
  nameEn?: string | null;
  nameZh?: string | null;
  order: number;
  active?: boolean;
}

export interface CommunityTagCategory {
  id: string;
  nameJa: string;
  nameEn?: string | null;
  nameZh?: string | null;
  order: number;
  active?: boolean;
  tags: CommunityTag[];
}

export interface EventSummary {
  id: string;
  status: string;
  title: LocalizedContent;
  description?: LocalizedContent;
  descriptionHtml?: string | null;
  startTime: string;
  endTime?: string;
  locationText: string;
  locationLat?: number | null;
  locationLng?: number | null;
  community: CommunitySummary;
  category?: string | null;
  maxParticipants?: number | null;
  priceRange?: {
    min: number;
    max: number;
  };
  coverImageUrl?: string | null;
  communityLogoUrl?: string | null;
  ticketTypes?: Array<{
    id: string;
    name: LocalizedContent;
    price: number;
  }>;
  config?: Record<string, any> | null;
}

export interface RegistrationFormField {
  id?: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface EventGalleryItem {
  id: string;
  imageUrl: string;
  order: number;
}

export interface EventDetail {
  id: string;
  status: string;
  visibility?: string;
  title: LocalizedContent;
  description?: LocalizedContent;
  descriptionHtml?: string | null;
  startTime: string;
  endTime?: string;
  regStartTime?: string | null;
  regEndTime?: string | null;
  regDeadline?: string | null;
  locationText: string;
  locationLat?: number | null;
  locationLng?: number | null;
  category?: string | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  registrationFormSchema?: RegistrationFormField[] | null;
  config?: Record<string, any> | null;
  ticketTypes?: Array<{
    id: string;
    type: string;
    price?: number | null;
    name?: LocalizedContent | null;
    quota?: number | null;
  }>;
  community: CommunitySummary;
}

export interface CommunityPortalEvent {
  id: string;
  startTime: string;
  locationText: string;
  status: string;
  title?: LocalizedContent;
  coverImageUrl?: string | null;
}

export interface CommunityPortal {
  id: string;
  name: string;
  slug: string;
  description: LocalizedContent;
  coverImageUrl?: string | null;
  logoImageUrl?: string | null;
  labels: string[];
  visibleLevel: string;
  events: CommunityPortalEvent[];
  members?: Array<{
   id: string;
   name?: string | null;
   avatarUrl?: string | null;
  }>;
  memberCount?: number;
  isFollowing?: boolean;
  portalConfig?: {
    theme?: string;
    layout?: string[];
  };
}

export interface Lesson {
  id: string;
  classId: string;
  startAt: string;
  endAt?: string | null;
  capacity?: number | null;
  status: string;
}

export interface ClassSummary {
  id: string;
  communityId: string;
  title: string;
  description?: string | null;
  locationName?: string | null;
  priceYenPerLesson: number;
  defaultCapacity?: number | null;
  status: string;
  nextLesson?: Lesson | null;
}

export interface ClassDetail extends ClassSummary {
  upcomingLessons: Lesson[];
}

export interface DevLoginResponse {
  accessToken: string;
  user: UserProfile;
}

export interface EventWithCommunity {
  id: string;
  title: LocalizedContent;
  startTime: string;
  endTime?: string;
  locationText: string;
  community: CommunitySummary;
  coverImageUrl?: string | null;
}

export interface EventRegistrationSummary {
  registrationId: string;
  status: string;
  paymentStatus?: string;
  paymentRequired: boolean;
  amount?: number;
  eventId: string;
  ticketTypeId?: string;
  event?: EventWithCommunity;
}

export interface MyEventItem {
  registrationId: string;
  status: string;
  paymentStatus?: string;
  amount?: number | null;
  attended?: boolean;
  noShow?: boolean;
  refundRequest?: {
    id: string;
    status: string;
    decision?: string | null;
    requestedAmount?: number | null;
    approvedAmount?: number | null;
    refundedAmount?: number | null;
    reason?: string | null;
  } | null;
  event: EventWithCommunity | null;
  lesson?: {
    id: string;
    startAt: string;
    endAt?: string | null;
    status: string;
    class?: {
      id: string;
      title: string | LocalizedContent;
      locationName?: string | null;
      community?: CommunitySummary;
    } | null;
  } | null;
}

export interface MockPaymentResponse {
  paymentId: string;
  status: string;
  registrationId: string;
  amount: number;
}

export interface ConsolePaymentRefundRequest {
  id: string;
  status: string;
  decision?: string | null;
  requestedAmount: number;
  approvedAmount?: number | null;
  refundedAmount?: number | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolePaymentItem {
  id: string;
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  event: {
    id: string;
    title: string;
  } | null;
  registrationId?: string | null;
  amount: number;
  platformFee: number;
  feePercent?: number | null;
  status: string;
  method: string;
  createdAt: string;
  stripePaymentIntentId?: string | null;
  stripeRefundId?: string | null;
  refundRequest?: ConsolePaymentRefundRequest | null;
}

export interface ConsolePaymentList {
  items: ConsolePaymentItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ConsoleCommunityBalance {
  communityId: string;
  currency: string;
  grossPaid: number;
  platformFee: number;
  refunded: number;
  net: number;
  period?: 'month' | 'all';
  stripeBalance?: {
    available: number;
    pending: number;
  } | null;
}

export interface StripeCheckoutResponse {
  checkoutUrl: string;
  resume?: boolean;
}

export interface SubscriptionResponse {
  planId: string;
  subscriptionId: string | null;
  checkoutUrl?: string | null;
  sessionId?: string | null;
  clientSecret?: string | null;
  publishableKey?: string | null;
  customerId?: string | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  monthlyFee: number;
  transactionFeePercent: number;
  transactionFeeFixed: number;
  payoutSchedule: string;
  features?: Record<string, any> | null;
  stripePriceId?: string | null;
  active: boolean;
}

export interface ManagedCommunity {
  id: string;
  name: string;
  slug: string;
  labels?: string[];
  visibleLevel?: string;
  createdAt?: string;
  coverImageUrl?: string | null;
  logoImageUrl?: string | null;
  role?: string | null;
}

export interface ConsoleCommunityDetail extends ManagedCommunity {
  description: LocalizedContent;
  coverImageUrl?: string | null;
  pricingPlanId?: string | null;
  stripeAccountId?: string | null;
  stripeAccountOnboarded?: boolean;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
}

export interface ConsoleEventSummary {
  id: string;
  title: LocalizedContent;
  startTime: string;
  endTime?: string;
  status: string;
  visibility: string;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  coverImageUrl?: string | null;
}

export interface ConsoleEventDetail extends ConsoleEventSummary {
  communityId: string;
  description: LocalizedContent;
  descriptionHtml?: string | null;
  regDeadline: string;
  regStartTime?: string | null;
  regEndTime?: string | null;
  locationText: string;
  locationLat?: number | null;
  locationLng?: number | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  requireApproval: boolean;
  category?: string | null;
  registrationFormSchema?: RegistrationFormField[] | null;
  config?: Record<string, any> | null;
  coverType?: string | null;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  reviewReviewedAt?: string | null;
  reviewReviewerId?: string | null;
  ticketTypes: Array<{
    id: string;
    name: LocalizedContent;
    type: string;
    price: number;
    quota?: number | null;
  }>;
  galleries?: EventGalleryItem[];
}

export interface EventRegistrationsSummary {
  eventId: string;
  title: string;
  status: string;
  capacity?: number | null;
  totalRegistrations: number;
  paidRegistrations: number;
  attended: number;
  noShow: number;
  groups: Array<{
    label: string;
    count: number;
    capacity?: number | null;
  }>;
  avatars: Array<{
    userId: string;
    name?: string | null;
    avatarUrl?: string | null;
    status: string;
  }>;
}

export interface ConsoleEventRegistrationItem {
  registrationId: string;
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  ticket: {
    id?: string;
    name?: string;
    price?: number | null;
  } | null;
  status: string;
  paymentStatus: string;
  paymentId?: string | null;
  attended: boolean;
  noShow: boolean;
  amount?: number | null;
  createdAt: string;
  formAnswers?: Record<string, unknown>;
}

export interface ConsoleEventRegistrationsResponse {
  total: number;
  items: ConsoleEventRegistrationItem[];
}

export interface ConsoleEventAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'proposal';
  content: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

export interface ConsoleEventAssistantLog {
  id: string;
  communityId: string;
  userId: string;
  user?: {
    id: string;
    name?: string | null;
  } | null;
  stage: string;
  summary?: string | null;
  qaState?: Record<string, unknown> | null;
  messages: ConsoleEventAssistantMessage[];
  aiResult?: Record<string, unknown> | null;
  promptVersion?: string | null;
  status?: string | null;
  turnCount?: number | null;
  language?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string;
}

export interface EventAssistantDashboardStats {
  totalSessions: number;
  readySessions: number;
  readyRate: number;
  averageTurns: number;
  promptVersions: Record<string, number>;
  languages: Record<string, number>;
}

export interface EventAssistantDashboard {
  stats: EventAssistantDashboardStats;
  logs: ConsoleEventAssistantLog[];
}

export interface OrganizerApplicationInfo {
  id: string;
  status: string;
  reason?: string | null;
  experience?: string | null;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
}

export interface OrganizerApplicationStatus {
  hasApplied: boolean;
  isOrganizer: boolean;
  application: OrganizerApplicationInfo | null;
}

export interface CommunityAnalytics {
  communityId: string;
  totalEvents: number;
  totalRegistrations: number;
  totalAttended: number;
  totalNoShow: number;
  attendanceRate: number;
  followerCount?: number;
  pageViewsMonth?: number;
}

export interface GeneratedEventContent {
  title: LocalizedContent;
  subtitle?: LocalizedContent;
  description: LocalizedContent;
  notes: LocalizedContent;
  riskNotice: LocalizedContent;
  snsCaptions: {
    line: Record<string, string>;
    instagram: Record<string, string>;
  };
  logistics?: {
    startTime?: string;
    endTime?: string;
    locationText?: string;
    locationNote?: string;
  };
  ticketTypes?: Array<{
    name: string;
    price: number;
    currency?: string;
    quota?: number | null;
    type?: string;
  }>;
  requirements?: Array<{ label: string; type?: 'must' | 'nice-to-have' }>;
  registrationForm?: Array<{ label: string; type: string; required?: boolean }>;
  visibility?: EventVisibility;
}

export interface GenerateEventCopyInput {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
  details: string;
}

export interface EventAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface EventAssistantRequest extends GenerateEventCopyInput {
  conversation: EventAssistantMessage[];
}

export type EventAssistantStatus = 'collecting' | 'options' | 'ready';

export interface EventAssistantReply {
  status: EventAssistantStatus;
  message: string;
  options?: string[];
  proposal?: GeneratedEventContent;
  thinkingSteps?: string[];
  stage?: 'coach' | 'editor' | 'writer';
  coachPrompts?: string[];
  editorChecklist?: string[];
  writerSummary?: {
    headline?: string;
    audience?: string;
    logistics?: string;
    riskNotes?: string;
    nextSteps?: string;
  };
  confirmQuestions?: string[];
  promptVersion: string;
  language: string;
  turnCount: number;
}

export interface EventAssistantProfileDefaults {
  version: string;
  defaults: {
    baseLanguage: string;
    topic: string;
    audience: string;
    style: string;
  };
}

export type EventVisibility = 'public' | 'community-only' | 'private';

export interface EventTicketDraft {
  id?: string;
  name: LocalizedContent | string;
  type?: string;
  price: number;
  currency?: string;
  quota?: number | null;
  description?: string;
}

export interface EventScheduleEntry {
  start?: string;
  label: string;
  description?: string;
}

export interface EventRequirement {
  label: string;
  type?: 'must' | 'nice-to-have';
}

export interface EventDraftConfig {
  requireCheckin?: boolean;
  enableWaitlist?: boolean;
  visibleRange?: 'public' | 'community' | 'private';
  notes?: string;
  riskNoticeEnabled?: boolean;
  riskNoticeText?: string;
  refundPolicy?: string;
}

export interface EventDraft {
  id?: string;
  communityId?: string;
  status?: 'draft' | 'ready' | 'published' | 'open' | 'closed' | 'archived';
  title: LocalizedContent | string;
  subtitle?: LocalizedContent | string;
  purpose?: LocalizedContent | string;
  description: LocalizedContent | string;
  descriptionHtml?: string;
  targetAudience?: string;
  languages?: string[];
  format?: 'online' | 'offline' | 'hybrid';
  startTime: string;
  endTime?: string;
  regStartTime?: string;
  regEndTime?: string;
  regDeadline?: string;
  locationText: string;
  locationLat?: number | null;
  locationLng?: number | null;
  category?: string;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  capacity?: number | null;
  vibe?: 'intimate' | 'casual' | 'open' | 'formal' | string;
  isFree?: boolean;
  ticketTypes: EventTicketDraft[];
  scheduleOutline?: EventScheduleEntry[];
  requirements?: EventRequirement[];
  bringList?: string[];
  riskNotice?: string;
  refundPolicy?: string;
  visibility: EventVisibility;
  requireApproval?: boolean;
  config?: EventDraftConfig;
  registrationFormSchema: RegistrationFormField[];
  aiSummary?: string;
  versionNotes?: string;
}

export interface AiModuleUsageMetrics {
  totalLogs: number;
  last24h: number;
  last7d: number;
  activeCommunities: number;
  activeUsers: number;
  lastActivityAt?: string | null;
}

export interface AiModuleUsageSummary {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'coming-soon';
  metrics?: AiModuleUsageMetrics;
}

export interface AiUsageSummaryResponse {
  generatedAt: string;
  modules: AiModuleUsageSummary[];
}

export interface AiCommunityUsage {
  communityId: string;
  totalAiCallsThisMonth: number;
  estimatedMinutesSaved: number;
}

export interface AdminEventReviewItem {
  id: string;
  title: LocalizedContent;
  status: string;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  updatedAt: string;
  community?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface AiAssistantSessionSummary {
  id: string;
  communityId: string;
  communityName: string;
  userId: string;
  userName: string;
  userEmail?: string | null;
  stage?: string | null;
  status?: string | null;
  summary?: string | null;
  turnCount?: number | null;
  createdAt: string;
}

export interface AiUsageDetailResponse {
  module: {
    id: string;
    name: string;
    description: string;
  };
  metrics: AiModuleUsageMetrics & {
    avgTurns: number | null;
  };
  breakdown: {
    stage: Array<{ label: string; count: number }>;
    language: Array<{ label: string; count: number }>;
  };
  recentSessions: AiAssistantSessionSummary[];
}

export interface PromptDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  system: string;
  instructions?: string;
  params?: string[];
  tags?: string[];
  meta?: Record<string, any>;
  status?: string;
  approvedById?: string | null;
  approvedAt?: string | null;
}

export interface SupportedLanguagesResponse {
  default: string;
  supported: string[];
}

export interface RenderPromptRequest {
  promptId: string;
  params?: Record<string, string>;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
}

export interface CompletePromptRequest extends RenderPromptRequest {
  temperature?: number;
}

export interface EvalPromptRequest {
  promptId?: string;
  cases?: Array<{ params?: Record<string, string>; expectContains?: string }>;
}

export interface RenderPromptRequest {
  promptId: string;
  params?: Record<string, string>;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
}

export interface CompletePromptRequest extends RenderPromptRequest {
  temperature?: number;
}

export interface EvalPromptRequest {
  promptId?: string;
  cases?: Array<{ params?: Record<string, string>; expectContains?: string }>;
}
