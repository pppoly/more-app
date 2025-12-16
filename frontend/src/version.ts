// Build version injected at build time via Vite define.
// eslint-disable-next-line no-undef
export const BUILD_VERSION: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev';
