export const DEBUG_SEED = 'zkDEBUG';

export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function isDebugSeedActive(seed: string): boolean {
  return seed === DEBUG_SEED && isLocalhost();
}
