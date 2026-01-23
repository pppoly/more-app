import { liffInstance } from './liff';

function hasNavigator(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string';
}

export function isLineBrowser(): boolean {
  if (!hasNavigator()) return false;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('liff') || ua.includes('miniapp')) return true;
  // Match LINE token without catching words like "guideline".
  return /(^|\W)line(\/|\W|$)/.test(ua);
}

export function isLiffClient(): boolean {
  try {
    return Boolean(liffInstance?.isInClient && liffInstance.isInClient());
  } catch {
    // If LIFF is not initialized yet, fall back to UA heuristics.
  }
  if (!hasNavigator()) return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('liff') || ua.includes('miniapp');
}
