/**
 * Seeded pseudo-random number generator using mulberry32 algorithm.
 * Same seed always produces the same sequence of random numbers.
 */

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export interface Rng {
  next(): number;
  nextInt(min: number, max: number): number;
  shuffle<T>(array: T[]): T[];
  pick<T>(array: T[]): T;
}

export function createRng(seed: string): Rng {
  let state = hashString(seed);

  // mulberry32 algorithm
  const next = (): number => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (min: number, max: number): number => {
    return Math.floor(next() * (max - min + 1)) + min;
  };

  const shuffle = <T>(array: T[]): T[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const pick = <T>(array: T[]): T => {
    return array[nextInt(0, array.length - 1)];
  };

  return { next, nextInt, shuffle, pick };
}
