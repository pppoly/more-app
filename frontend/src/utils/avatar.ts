import defaultAvatar from '../assets/images/default-avatar.svg';

const apiOrigin =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/api\/v1\/?$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export function resolveAvatarUrl(url?: string | null): string {
  if (!url) return defaultAvatar;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${apiOrigin}${url}`;
  return url;
}

export function avatarInitial(name?: string | null): string {
  if (!name) return '？';
  return name.trim().slice(0, 1).toUpperCase();
}
