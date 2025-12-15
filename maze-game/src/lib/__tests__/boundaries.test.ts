import { describe, it, expect } from 'vitest';
import { getCharacterBoundaries, calculateEntryCount, PIXEL_FONT } from '../pixelFont';

describe('getCharacterBoundaries', () => {
  describe('external boundaries', () => {
    it('returns external boundaries for uppercase O (ring shape)', () => {
      const boundaries = getCharacterBoundaries('O');

      // O has a ring shape - all filled cells should border external space
      expect(boundaries.external.length).toBeGreaterThan(0);

      // All external boundary cells should be filled in the pattern
      const pattern = PIXEL_FONT['O'];
      for (const entry of boundaries.external) {
        expect(pattern[entry.y][entry.x]).toBe(true);
      }
    });

    it('returns external boundaries for lowercase o (with empty top rows)', () => {
      const boundaries = getCharacterBoundaries('o');

      // lowercase o has empty top rows, but should still have valid external boundaries
      expect(boundaries.external.length).toBeGreaterThan(0);

      // The boundaries should NOT include row 0 or 1 since they're empty
      const pattern = PIXEL_FONT['o'];
      for (const entry of boundaries.external) {
        expect(pattern[entry.y][entry.x]).toBe(true);
      }
    });

    it('returns external boundaries for L (no enclosed regions)', () => {
      const boundaries = getCharacterBoundaries('L');

      // L is an open shape with no enclosed regions
      expect(boundaries.external.length).toBeGreaterThan(0);
      expect(boundaries.internal.length).toBe(0);
    });

    it('returns correct sides for external boundaries', () => {
      const boundaries = getCharacterBoundaries('L');

      // Each boundary entry should have a valid side
      const validSides = ['top', 'bottom', 'left', 'right'];
      for (const entry of boundaries.external) {
        expect(validSides).toContain(entry.side);
      }
    });

    it('returns consistent results (deterministic)', () => {
      const boundaries1 = getCharacterBoundaries('A');
      const boundaries2 = getCharacterBoundaries('A');

      expect(boundaries1.external).toEqual(boundaries2.external);
      expect(boundaries1.internal).toEqual(boundaries2.internal);
    });
  });

  describe('internal boundaries (enclosed regions)', () => {
    it('detects 1 enclosed region for uppercase O', () => {
      const boundaries = getCharacterBoundaries('O');

      // O has one enclosed center region
      expect(boundaries.internal.length).toBe(1);
      expect(boundaries.internal[0].length).toBeGreaterThan(0);
    });

    it('detects 1 enclosed region for lowercase o', () => {
      const boundaries = getCharacterBoundaries('o');

      // lowercase o also has one enclosed center region
      expect(boundaries.internal.length).toBe(1);
    });

    it('detects 2 enclosed regions for uppercase B', () => {
      const boundaries = getCharacterBoundaries('B');

      // B has two bumps/enclosed spaces
      expect(boundaries.internal.length).toBe(2);
    });

    it('detects 2 enclosed regions for 8', () => {
      const boundaries = getCharacterBoundaries('8');

      // 8 has two enclosed loops
      expect(boundaries.internal.length).toBe(2);
    });

    it('detects 0 enclosed regions for C (open shape)', () => {
      const boundaries = getCharacterBoundaries('C');

      // C is open on the right side
      expect(boundaries.internal.length).toBe(0);
    });

    it('detects 0 enclosed regions for L (open shape)', () => {
      const boundaries = getCharacterBoundaries('L');

      expect(boundaries.internal.length).toBe(0);
    });

    it('detects enclosed region for lowercase e', () => {
      const boundaries = getCharacterBoundaries('e');

      // e has an enclosed top region
      expect(boundaries.internal.length).toBeGreaterThanOrEqual(1);
    });

    it('detects enclosed region for lowercase a', () => {
      const boundaries = getCharacterBoundaries('a');

      // a has an enclosed region
      expect(boundaries.internal.length).toBeGreaterThanOrEqual(1);
    });

    it('internal boundary cells are filled cells adjacent to enclosed empty space', () => {
      const boundaries = getCharacterBoundaries('O');
      const pattern = PIXEL_FONT['O'];

      for (const region of boundaries.internal) {
        for (const entry of region) {
          // Each internal boundary cell should be a filled cell
          expect(pattern[entry.y][entry.x]).toBe(true);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('returns empty for space character', () => {
      const boundaries = getCharacterBoundaries(' ');

      expect(boundaries.external.length).toBe(0);
      expect(boundaries.internal.length).toBe(0);
    });

    it('returns empty for unknown character', () => {
      const boundaries = getCharacterBoundaries('★');

      expect(boundaries.external.length).toBe(0);
      expect(boundaries.internal.length).toBe(0);
    });

    it('handles punctuation characters', () => {
      const boundaries = getCharacterBoundaries('.');

      // Period should have external boundaries but no internal
      expect(boundaries.external.length).toBeGreaterThan(0);
      expect(boundaries.internal.length).toBe(0);
    });
  });

  describe('boundary sides correctness', () => {
    it('top side means external space is above the filled cell', () => {
      const boundaries = getCharacterBoundaries('L');
      const pattern = PIXEL_FONT['L'];

      const topEntries = boundaries.external.filter(e => e.side === 'top');
      for (const entry of topEntries) {
        // For a 'top' entry, either y=0 (top row) or cell above is empty
        if (entry.y > 0) {
          expect(pattern[entry.y - 1][entry.x]).toBe(false);
        }
      }
    });

    it('bottom side means external space is below the filled cell', () => {
      const boundaries = getCharacterBoundaries('L');
      const pattern = PIXEL_FONT['L'];

      const bottomEntries = boundaries.external.filter(e => e.side === 'bottom');
      for (const entry of bottomEntries) {
        // For a 'bottom' entry, either y=height-1 (bottom row) or cell below is empty
        if (entry.y < pattern.length - 1) {
          expect(pattern[entry.y + 1][entry.x]).toBe(false);
        }
      }
    });
  });
});

describe('calculateEntryCount', () => {
  describe('external entries', () => {
    it('returns minimum 3 for small boundaries', () => {
      expect(calculateEntryCount(1, false)).toBe(3);
      expect(calculateEntryCount(5, false)).toBe(3);
      expect(calculateEntryCount(11, false)).toBe(3);
    });

    it('returns maximum 6 for large boundaries', () => {
      expect(calculateEntryCount(100, false)).toBe(6);
      expect(calculateEntryCount(50, false)).toBe(6);
    });

    it('scales proportionally in the middle range', () => {
      // floor(16/4) = 4, which is between 3 and 6
      expect(calculateEntryCount(16, false)).toBe(4);
      // floor(20/4) = 5
      expect(calculateEntryCount(20, false)).toBe(5);
    });

    it('returns 0 for empty boundary', () => {
      expect(calculateEntryCount(0, false)).toBe(0);
    });
  });

  describe('internal entries', () => {
    it('returns minimum 1 for small regions', () => {
      expect(calculateEntryCount(1, true)).toBe(1);
      expect(calculateEntryCount(5, true)).toBe(1);
    });

    it('returns maximum 2 for large regions', () => {
      expect(calculateEntryCount(100, true)).toBe(2);
      expect(calculateEntryCount(20, true)).toBe(2);
    });

    it('returns 0 for empty region', () => {
      expect(calculateEntryCount(0, true)).toBe(0);
    });
  });
});
