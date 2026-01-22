/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_APP_TARGET?: string;
  readonly VITE_LINE_CHANNEL_ID?: string;
  readonly VITE_LIFF_ID?: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_FRONTEND_BASE_URL?: string;
  readonly VITE_EVENT_ASSISTANT_MACHINE_UI_ONLY?: string;
  readonly VITE_STRIPE_FEE_PERCENT?: string;
  readonly VITE_STRIPE_FEE_FIXED_JPY?: string;
  readonly VITE_PLATFORM_FEE_WAIVED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
