import { useCallback, useEffect, useState } from 'react';
import type {
  ColorScheme,
  GameState,
  MazeData,
  Move,
  Position,
} from '../types';
import { canMove, generateMaze, getNewPosition } from '../lib/mazeGenerator';
import { isDebugSeedActive } from '../lib/debugSeed';
import {
  computeHashAlignedPalette,
  generateColorScheme,
} from '../lib/colorGenerator';
import { mazeFromLayoutBytes } from '../lib/mazeFromLayoutBytes';
import { addSeedToHistory } from '../lib/seedHistory';
import type { ReplayPayload } from '../components/Game';

const DIRECTION_TO_MOVE: Record<string, Move> = {
  up: 0, // Move.Up
  right: 1, // Move.Right
  down: 2, // Move.Down
  left: 3, // Move.Left
};

function tokenIdToMazeHash(tokenId: bigint): `0x${string}` {
  return `0x${tokenId.toString(16).padStart(64, '0')}`;
}

/**
 * Display label for replay sessions where we don't know the original seed.
 * Sharing/winning still wants a string in the seed slot; this gives a stable
 * placeholder derived from the tokenId.
 */
function tokenIdShortLabel(tokenId: bigint): string {
  const hex = tokenId.toString(16).padStart(64, '0');
  return `Token #0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export interface InitialPositions {
  startPos: Position;
  robePos: Position;
  scepterPos: Position;
  goalPos: Position;
}

interface UseGameStateArgs {
  initialSeed: string;
  onSeedChange: (seed: string) => void;
  replay: ReplayPayload | null;
}

export interface UseGameStateResult {
  seed: string;
  maze: MazeData | null;
  colors: ColorScheme | null;
  gameState: GameState | null;
  visited: Set<string>;
  initialPositions: InitialPositions | null;
  showKinglyHint: boolean;
  winModalDismissed: boolean;
  setWinModalDismissed: (v: boolean) => void;
  initGame: (newSeed: string) => void;
  initFromReplay: (payload: ReplayPayload) => void;
  handleMove: (direction: 'up' | 'down' | 'left' | 'right') => void;
  handlePlayAgain: () => void;
}

/**
 * Owns all maze-game state: the current seed, generated maze, palette, runtime
 * `GameState`, visited cell set, initial positions snapshot for proof
 * generation, and a few transient flags. Returns initGame/initFromReplay/
 * handleMove so the Game component stays focused on layout.
 */
export function useGameState({
  initialSeed,
  onSeedChange,
  replay,
}: UseGameStateArgs): UseGameStateResult {
  const [seed, setSeed] = useState(initialSeed);
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [colors, setColors] = useState<ColorScheme | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [showKinglyHint, setShowKinglyHint] = useState(false);
  const [winModalDismissed, setWinModalDismissed] = useState(false);
  const [initialPositions, setInitialPositions] =
    useState<InitialPositions | null>(null);

  const initGame = useCallback(
    (newSeed: string) => {
      const generated = generateMaze(newSeed, {
        debug: isDebugSeedActive(newSeed),
      });
      // First paint uses the seed-only palette so colors render immediately;
      // we then upgrade to the hash-aligned palette (matches on-chain SVG)
      // once the bb.js Pedersen WASM has computed the maze hash. Both
      // generators are deterministic for the same inputs, so the upgrade is
      // a single re-paint with no flicker beyond the hue shift.
      const newColors = generateColorScheme(newSeed);

      setMaze(generated.maze);
      setColors(newColors);

      void (async () => {
        try {
          const upgraded = await computeHashAlignedPalette(newSeed);
          // Guard against a stale upgrade landing on a newer seed.
          setSeed((current) => {
            if (current === newSeed) setColors(upgraded);
            return current;
          });
        } catch (err) {
          // If WASM init or hashing fails we just keep the seed-only colors;
          // proof/mint will surface its own error path.
          console.warn('Failed to compute maze hash for color alignment:', err);
        }
      })();

      setInitialPositions({
        startPos: { ...generated.kingPos },
        robePos: { ...generated.robePos },
        scepterPos: { ...generated.scepterPos },
        goalPos: { ...generated.goalPos },
      });

      const startKey = `${generated.kingPos.x},${generated.kingPos.y}`;
      setVisited(new Set([startKey]));
      setShowKinglyHint(false);

      setGameState({
        playerPos: { ...generated.kingPos },
        robePos: { ...generated.robePos },
        scepterPos: { ...generated.scepterPos },
        goalPos: { ...generated.goalPos },
        hasRobe: false,
        hasScepter: false,
        moveCount: 0,
        moves: [],
        gameWon: false,
      });
      setWinModalDismissed(false);
      setSeed(newSeed);
      onSeedChange(newSeed);
      addSeedToHistory(newSeed);
    },
    [onSeedChange]
  );

  const initFromReplay = useCallback((payload: ReplayPayload) => {
    const decoded = mazeFromLayoutBytes(payload.layout);
    const displaySeed = payload.seed ?? tokenIdShortLabel(payload.tokenId);
    // tokenId IS the Pedersen mazeHash under the hash-as-public-input
    // architecture (ma-6cr.6), so we can paint the canonical palette
    // immediately — no async upgrade dance like the seed path.
    const mazeHash = tokenIdToMazeHash(payload.tokenId);
    const newColors = generateColorScheme(displaySeed, { mazeHash });

    setMaze(decoded.maze);
    setColors(newColors);
    setInitialPositions({
      startPos: { ...decoded.startPos },
      robePos: { ...decoded.robePos },
      scepterPos: { ...decoded.scepterPos },
      goalPos: { ...decoded.goalPos },
    });

    const startKey = `${decoded.startPos.x},${decoded.startPos.y}`;
    setVisited(new Set([startKey]));
    setShowKinglyHint(false);

    setGameState({
      playerPos: { ...decoded.startPos },
      robePos: { ...decoded.robePos },
      scepterPos: { ...decoded.scepterPos },
      goalPos: { ...decoded.goalPos },
      hasRobe: false,
      hasScepter: false,
      moveCount: 0,
      moves: [],
      gameWon: false,
    });
    setWinModalDismissed(false);
    setSeed(displaySeed);
    // Replay mazes don't change the URL ?seed= and don't go in history —
    // they're tied to a tokenId, not a typeable seed string.
  }, []);

  // Initialize on mount or input change. `replay` takes priority over
  // `initialSeed`: when the parent hands off a tokenId we ignore the URL seed
  // until they clear `replay` back to null.
  useEffect(() => {
    if (replay) {
      initFromReplay(replay);
    } else {
      initGame(initialSeed);
    }
  }, [replay, initialSeed, initGame, initFromReplay]);

  const handleMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!maze || !gameState || gameState.gameWon) return;

      if (canMove(maze, gameState.playerPos, direction)) {
        const newPos = getNewPosition(maze, gameState.playerPos, direction);

        const posKey = `${newPos.x},${newPos.y}`;
        setVisited((prev) => new Set([...prev, posKey]));

        setGameState((prev) => {
          if (!prev) return prev;

          const newState = {
            ...prev,
            playerPos: newPos,
            moveCount: prev.moveCount + 1,
            moves: [...prev.moves, DIRECTION_TO_MOVE[direction] as Move],
          };

          if (
            prev.robePos &&
            newPos.x === prev.robePos.x &&
            newPos.y === prev.robePos.y
          ) {
            newState.hasRobe = true;
            newState.robePos = { x: -1, y: -1 };
          }

          if (
            prev.scepterPos &&
            newPos.x === prev.scepterPos.x &&
            newPos.y === prev.scepterPos.y
          ) {
            newState.hasScepter = true;
            newState.scepterPos = { x: -1, y: -1 };
          }

          const reachedGoal =
            newPos.x === prev.goalPos.x && newPos.y === prev.goalPos.y;
          const fullRegalia = newState.hasRobe && newState.hasScepter;

          // Reaching the crown only wins when wearing both regalia pieces.
          // Without them, surface the hint instead — the goal stays unclaimed.
          if (reachedGoal && fullRegalia) {
            newState.gameWon = true;
            setShowKinglyHint(false);
          } else if (reachedGoal && !fullRegalia) {
            setShowKinglyHint(true);
          } else {
            setShowKinglyHint(false);
          }

          return newState;
        });
      }
    },
    [maze, gameState]
  );

  const handlePlayAgain = useCallback(() => {
    if (replay) {
      initFromReplay(replay);
    } else {
      initGame(seed);
    }
  }, [replay, initFromReplay, initGame, seed]);

  return {
    seed,
    maze,
    colors,
    gameState,
    visited,
    initialPositions,
    showKinglyHint,
    winModalDismissed,
    setWinModalDismissed,
    initGame,
    initFromReplay,
    handleMove,
    handlePlayAgain,
  };
}
