export type NotificationChannel = 'line' | 'email';
export type NotificationRole = 'user' | 'organizer' | 'admin';
export type NotificationCategory = 'transactional' | 'marketing' | 'operational';
export type NotificationLocale = 'ja' | 'en' | 'zh';

export type NotificationType =
  | 'user.email.verify'
  | 'user.registration.created'
  | 'user.registration.approved'
  | 'user.registration.rejected'
  | 'user.payment.succeeded'
  | 'user.payment.failed'
  | 'user.payment.expired'
  | 'user.event.cancelled'
  | 'user.event.changed'
  | 'user.refund.failed'
  | 'organizer.email.verify'
  | 'organizer.event.submitted'
  | 'organizer.event.review.approved'
  | 'organizer.event.review.rejected'
  | 'organizer.registration.pending'
  | 'organizer.registration.success'
  | 'organizer.registration.cancel_free'
  | 'organizer.registration.cancel_paid'
  | 'organizer.payment.expired'
  | 'organizer.event.system_cancelled'
  | 'organizer.event.reminder'
  | 'organizer.settlement.eligible'
  | 'organizer.payout.succeeded'
  | 'organizer.payout.failed'
  | 'organizer.refund.occurred'
  | 'organizer.dispute.updated'
  | 'user.community.event_published'
  | 'user.registration.success'
  | 'user.refund.success'
  | 'user.cancel.success'
  | 'user.event.reminder'
  | 'admin.system.alert'
  | 'admin.business.alert'
  | 'admin.notification.alert';

export type NotificationContent = {
  title: string;
  body: string;
};

export type NotificationEmailContent = {
  subject: string;
  body: string;
};

export type LocalizedTemplates<T> = Partial<Record<NotificationLocale, T>>;

export type NotificationTemplate = {
  label?: string;
  description?: string;
  defaultEnabled?: boolean;
  role: NotificationRole;
  category: NotificationCategory;
  line: LocalizedTemplates<NotificationContent>;
  email: LocalizedTemplates<NotificationEmailContent>;
};

export type NotificationData = Record<string, string | number | null | undefined>;

export type NotificationSendResult = {
  channel: NotificationChannel;
  status: 'sent' | 'skipped' | 'failed';
  errorMessage?: string;
};
