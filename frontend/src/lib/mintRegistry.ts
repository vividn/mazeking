/**
 * Local tokenId↔seed registry.
 *
 * The on-chain contract derives tokenId from the maze layout, not from the
 * seed string — so given an owned tokenId we cannot recover the seed needed to
 * replay the maze in the game. We work around this by remembering, in
 * localStorage, every tokenId↔seed pair we've seen on this browser:
 *
 *   - Recorded at mint time when both are known.
 *   - Hydrated lazily from seedHistory at view-open (recompute tokenId for
 *     each historical seed and union into the map).
 *
 * The map is keyed by tokenId as a 0x-prefixed hex string (uint256 doesn't fit
 * in a JS number) and values are the original seed strings.
 */

const STORAGE_KEY = 'maze-king-mint-registry';

type Registry = Record<string, string>;

function tokenIdKey(tokenId: bigint): string {
  return `0x${tokenId.toString(16)}`;
}

function load(): Registry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Registry) : {};
  } catch {
    return {};
  }
}

function save(reg: Registry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // ignore quota / serialisation errors
  }
}

export function rememberMint(tokenId: bigint, seed: string): void {
  const reg = load();
  reg[tokenIdKey(tokenId)] = seed;
  save(reg);
}

export function lookupSeed(tokenId: bigint): string | undefined {
  return load()[tokenIdKey(tokenId)];
}

export function rememberMany(
  entries: Array<{ tokenId: bigint; seed: string }>
): void {
  if (entries.length === 0) return;
  const reg = load();
  for (const { tokenId, seed } of entries) {
    reg[tokenIdKey(tokenId)] = seed;
  }
  save(reg);
}
