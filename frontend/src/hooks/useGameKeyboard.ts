import { useEffect } from 'react';
import { getRandomPhrase } from '../lib/seedPhrases';
import type { ReplayPayload } from '../components/Game';

interface UseGameKeyboardArgs {
  /** Skip the listener entirely when the Game route isn't mounted/active. */
  active: boolean;
  gameWon: boolean;
  seedBarOpen: boolean;
  historySidebarOpen: boolean;
  setHistorySidebarOpen: (open: boolean) => void;
  setSeedBarOpen: (open: boolean) => void;
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => void;
  initGame: (newSeed: string) => void;
  initFromReplay: (payload: ReplayPayload) => void;
  replay: ReplayPayload | null;
  seed: string;
  /** Optional: 0-key triggers a maze view reset (pan/zoom). */
  onResetView?: () => void;
}

/**
 * Wires the global keyboard listener for the Game route. Pulled out of Game.tsx
 * verbatim — no behavior change.
 */
export function useGameKeyboard({
  active,
  gameWon,
  seedBarOpen,
  historySidebarOpen,
  setHistorySidebarOpen,
  setSeedBarOpen,
  onMove,
  initGame,
  initFromReplay,
  replay,
  seed,
  onResetView,
}: UseGameKeyboardArgs): void {
  useEffect(() => {
    // Game routes own keyboard handling; on /mazes or /gallery the page is
    // responsible for any shortcuts it cares about, so we no-op here.
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (seedBarOpen) return;

      if (historySidebarOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setHistorySidebarOpen(false);
        }
        return;
      }

      // R key restarts the game (works even when won)
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (replay) {
          initFromReplay(replay);
        } else {
          initGame(seed);
        }
        return;
      }

      // 0 key resets the maze pan/zoom transform (works even when won).
      if (e.key === '0') {
        e.preventDefault();
        onResetView?.();
        return;
      }

      // n key opens seed bar
      if (e.key === 'n') {
        e.preventDefault();
        setSeedBarOpen(true);
        return;
      }

      // N (shift+n) generates random maze immediately
      if (e.key === 'N') {
        e.preventDefault();
        const randomSeed = getRandomPhrase();
        initGame(randomSeed);
        return;
      }

      if (gameWon) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'k':
          e.preventDefault();
          onMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
        case 'j':
          e.preventDefault();
          onMove('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
        case 'h':
          e.preventDefault();
          onMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
        case 'l':
          e.preventDefault();
          onMove('right');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active,
    onMove,
    gameWon,
    seedBarOpen,
    historySidebarOpen,
    setHistorySidebarOpen,
    setSeedBarOpen,
    initGame,
    initFromReplay,
    replay,
    seed,
    onResetView,
  ]);
}
