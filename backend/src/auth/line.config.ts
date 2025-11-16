export interface LineConfig {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
  frontendBaseUrl: string;
}

export function getLineConfig(): LineConfig {
  return {
    channelId: process.env.LINE_CHANNEL_ID || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    redirectUri: process.env.LINE_REDIRECT_URI || '',
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',
  };
}
