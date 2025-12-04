export interface LiffProfile {
  displayName: string;
  pictureUrl?: string | null;
}

export interface LiffInstance {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(options?: { redirectUri?: string }): void;
  getIDToken(): string | null;
  getProfile(): Promise<LiffProfile>;
  isInClient?(): boolean;
  closeWindow?(): void;
  shareTargetPicker?(messages: Array<{ type: 'text'; text: string }>): Promise<unknown>;
  sendMessages?(messages: Array<{ type: 'text'; text: string }>): Promise<unknown>;
}

declare global {
  interface Window {
    liff?: LiffInstance;
  }
}

let liffPromise: Promise<LiffInstance> | null = null;

export async function loadLiff(liffId: string): Promise<LiffInstance> {
  if (typeof window === 'undefined') {
    throw new Error('LIFF is only available in browser');
  }
  if (!liffId) {
    throw new Error('LIFF ID is missing');
  }
  if (window.liff) {
    await window.liff.init({ liffId });
    return window.liff;
  }
  if (!liffPromise) {
    liffPromise = new Promise<LiffInstance>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.async = true;
      script.onload = async () => {
        if (!window.liff) {
          liffPromise = null;
          reject(new Error('LIFF SDK did not expose window.liff'));
          return;
        }
        try {
          await window.liff.init({ liffId });
          resolve(window.liff);
        } catch (error) {
          liffPromise = null;
          reject(error);
        }
      };
      script.onerror = () => {
        liffPromise = null;
        reject(new Error('Failed to load LIFF SDK'));
      };
      document.head.appendChild(script);
    });
  }
  return liffPromise;
}
