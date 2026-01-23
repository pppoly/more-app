export interface LineConfig {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
  frontendBaseUrl: string;
}

function resolveChannelId(): string {
  return process.env.LINE_CHANNEL_ID || process.env.LINE_LOGIN_CHANNEL_ID || '';
}

function sanitizeRedirectUri(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\.+$/, '');
}

export function getLineConfig(): LineConfig {
  return {
    channelId: resolveChannelId(),
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    redirectUri: sanitizeRedirectUri(process.env.LINE_REDIRECT_URI),
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',
  };
}
