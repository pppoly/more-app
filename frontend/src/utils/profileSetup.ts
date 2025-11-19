import type { UserProfile } from '../types/api';

export function needsProfileSetup(user: UserProfile | null | undefined, mode?: string | null) {
  if (!user) return true;
  const normalizedMode = mode ?? '';
  if (normalizedMode === 'email' || normalizedMode === 'line') {
    return !user.name || !user.avatarUrl;
  }
  if (normalizedMode === 'dev') {
    return false;
  }
  return false;
}
