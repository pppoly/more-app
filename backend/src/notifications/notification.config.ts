export interface NotificationConfig {
  lineAccessToken: string;
  lineNotificationsDisabled: boolean;
  brevoApiKey: string;
  brevoSenderEmail: string;
  brevoSenderName: string;
  adminEmail: string;
  timeZone: string;
}

let cachedConfig: NotificationConfig | null = null;

export function getNotificationConfig(): NotificationConfig {
  if (cachedConfig) return cachedConfig;
  const rawLineDisabled = (
    process.env.LINE_NOTIFICATIONS_DISABLED ||
    process.env.NOTIFICATION_LINE_DISABLED ||
    ''
  )
    .trim()
    .toLowerCase();
  const lineNotificationsDisabled = rawLineDisabled
    ? ['1', 'true', 'yes'].includes(rawLineDisabled)
    : true;
  cachedConfig = {
    lineAccessToken: (process.env.LINE_MESSAGING_ACCESS_TOKEN || '').trim(),
    lineNotificationsDisabled,
    brevoApiKey: (process.env.BREVO_API_KEY || '').trim(),
    brevoSenderEmail: (process.env.BREVO_SENDER_EMAIL || '').trim(),
    brevoSenderName: (process.env.BREVO_SENDER_NAME || 'SocialMore').trim(),
    adminEmail: (process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@socialmore.co.jp').trim(),
    timeZone: (process.env.APP_TIMEZONE || 'Asia/Tokyo').trim(),
  };
  return cachedConfig;
}
