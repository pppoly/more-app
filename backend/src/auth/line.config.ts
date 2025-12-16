export interface LineConfig {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
  frontendBaseUrl: string;
}

function resolveChannelId(): string {
  return process.env.LINE_CHANNEL_ID || process.env.LINE_LOGIN_CHANNEL_ID || '';
}

export function getLineConfig(): LineConfig {
  return {
    channelId: resolveChannelId(),
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    redirectUri: process.env.LINE_REDIRECT_URI || '',
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',
  };
}
