// localStorage utility for tracking recently played seeds

const STORAGE_KEY = 'maze-king-seed-history';
const MAX_HISTORY = 15;

export interface SeedHistoryEntry {
  seed: string;
  timestamp: number;
}

// Get seed history from localStorage
export function getSeedHistory(): SeedHistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

// Add a seed to history (moves to top if already exists)
export function addSeedToHistory(seed: string): void {
  try {
    const history = getSeedHistory();

    // Remove if already exists
    const filtered = history.filter(entry => entry.seed !== seed);

    // Add to beginning
    const newEntry: SeedHistoryEntry = {
      seed,
      timestamp: Date.now(),
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

// Remove a specific seed from history
export function removeSeedFromHistory(seed: string): void {
  try {
    const history = getSeedHistory();
    const filtered = history.filter(entry => entry.seed !== seed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore localStorage errors
  }
}

// Clear all seed history
export function clearSeedHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

// Get just the seed strings (most recent first)
export function getRecentSeeds(): string[] {
  return getSeedHistory().map(entry => entry.seed);
}
