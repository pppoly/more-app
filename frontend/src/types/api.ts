export interface LocalizedContent {
  original?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id: string;
  name: string;
  language?: string | null;
  prefecture?: string | null;
  avatarUrl?: string | null;
  isOrganizer?: boolean;
}

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
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
  priceRange?: {
    min: number;
    max: number;
  };
  coverImageUrl?: string | null;
  ticketTypes?: Array<{
    id: string;
    name: LocalizedContent;
    price: number;
  }>;
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
  community: CommunitySummary;
}

export interface CommunityPortalEvent {
  id: string;
  startTime: string;
  locationText: string;
  status: string;
  title?: LocalizedContent;
}

export interface CommunityPortal {
  id: string;
  name: string;
  slug: string;
  description: LocalizedContent;
  coverImageUrl?: string | null;
  labels: string[];
  visibleLevel: string;
  events: CommunityPortalEvent[];
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
  event: EventWithCommunity;
}

export interface MockPaymentResponse {
  paymentId: string;
  status: string;
  registrationId: string;
  amount: number;
}

export interface StripeCheckoutResponse {
  checkoutUrl: string;
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
}

export interface GeneratedEventContent {
  title: LocalizedContent;
  description: LocalizedContent;
  notes: LocalizedContent;
  riskNotice: LocalizedContent;
  snsCaptions: {
    line: Record<string, string>;
    instagram: Record<string, string>;
  };
}

export interface GenerateEventCopyInput {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
  details: string;
}
