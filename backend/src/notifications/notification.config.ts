export interface NotificationConfig {
  lineAccessToken: string;
  brevoApiKey: string;
  brevoSenderEmail: string;
  brevoSenderName: string;
  adminEmail: string;
  timeZone: string;
}

let cachedConfig: NotificationConfig | null = null;

export function getNotificationConfig(): NotificationConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    lineAccessToken: (process.env.LINE_MESSAGING_ACCESS_TOKEN || '').trim(),
    brevoApiKey: (process.env.BREVO_API_KEY || '').trim(),
    brevoSenderEmail: (process.env.BREVO_SENDER_EMAIL || '').trim(),
    brevoSenderName: (process.env.BREVO_SENDER_NAME || 'SocialMore').trim(),
    adminEmail: (process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@socialmore.co.jp').trim(),
    timeZone: (process.env.APP_TIMEZONE || 'Asia/Tokyo').trim(),
  };
  return cachedConfig;
}
