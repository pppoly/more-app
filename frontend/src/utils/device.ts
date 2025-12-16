import { liffInstance } from './liff';

function hasNavigator(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string';
}

export function isLineBrowser(): boolean {
  if (!hasNavigator()) return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes(' line/') || ua.includes(' line ');
}

export function isLiffClient(): boolean {
  try {
    return Boolean(liffInstance?.isInClient && liffInstance.isInClient());
  } catch {
    // If LIFF is not initialized or throws, treat as non-LIFF client.
    return false;
  }
}
