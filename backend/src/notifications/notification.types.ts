export type NotificationChannel = 'line' | 'email';
export type NotificationRole = 'user' | 'organizer' | 'admin';
export type NotificationCategory = 'transactional' | 'marketing' | 'operational';
export type NotificationLocale = 'ja' | 'en' | 'zh';

export type NotificationType =
  | 'organizer.registration.success'
  | 'organizer.registration.cancel_free'
  | 'organizer.registration.cancel_paid'
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
