import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, MazeData, Move, ColorScheme } from '../types';
import { generateMaze, canMove, getNewPosition } from '../lib/mazeGenerator';
import { generateColorScheme } from '../lib/colorGenerator';
import { Maze } from './Maze';
import { Controls } from './Controls';
import { SeedInput } from './SeedInput';
import { WinModal } from './WinModal';

interface GameProps {
  initialSeed: string;
  onSeedChange: (seed: string) => void;
}

const DIRECTION_TO_MOVE: Record<string, Move> = {
  up: 0,    // Move.Up
  right: 1, // Move.Right
  down: 2,  // Move.Down
  left: 3,  // Move.Left
};

export function Game({ initialSeed, onSeedChange }: GameProps) {
  const [seed, setSeed] = useState(initialSeed);
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [colors, setColors] = useState<ColorScheme | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize game from seed
  const initGame = useCallback((newSeed: string) => {
    const generated = generateMaze(newSeed);
    const newColors = generateColorScheme(newSeed);

    setMaze(generated.maze);
    setColors(newColors);

    // Initialize visited with starting position
    const startKey = `${generated.kingPos.x},${generated.kingPos.y}`;
    setVisited(new Set([startKey]));

    setGameState({
      playerPos: { ...generated.kingPos },
      keyPos: { ...generated.keyPos },
      goalPos: { ...generated.goalPos },
      hasKey: false,
      moveCount: 0,
      moves: [],
      gameWon: false,
    });
    setSeed(newSeed);
    onSeedChange(newSeed);
  }, [onSeedChange]);

  // Initialize on mount or seed change
  useEffect(() => {
    initGame(initialSeed);
  }, [initialSeed, initGame]);

  // Handle movement
  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!maze || !gameState || gameState.gameWon) return;

    if (canMove(maze, gameState.playerPos, direction)) {
      const newPos = getNewPosition(maze, gameState.playerPos, direction);

      // Add new position to visited
      const posKey = `${newPos.x},${newPos.y}`;
      setVisited(prev => new Set([...prev, posKey]));

      setGameState(prev => {
        if (!prev) return prev;

        const newState = {
          ...prev,
          playerPos: newPos,
          moveCount: prev.moveCount + 1,
          moves: [...prev.moves, DIRECTION_TO_MOVE[direction] as Move],
        };

        // Check if picked up key
        if (prev.keyPos && newPos.x === prev.keyPos.x && newPos.y === prev.keyPos.y) {
          newState.hasKey = true;
          newState.keyPos = { x: -1, y: -1 }; // Mark as collected
        }

        // Check if reached goal with key
        if (newState.hasKey && newPos.x === prev.goalPos.x && newPos.y === prev.goalPos.y) {
          newState.gameWon = true;
        }

        return newState;
      });
    }
  }, [maze, gameState]);

  // Keyboard controls - only when input is not focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keys when typing in an input
      if (inputFocused) return;

      // R key restarts the game (works even when won)
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        initGame(seed);
        return;
      }

      if (gameState?.gameWon) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'k':
          e.preventDefault();
          handleMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
        case 'j':
          e.preventDefault();
          handleMove('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
        case 'h':
          e.preventDefault();
          handleMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
        case 'l':
          e.preventDefault();
          handleMove('right');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, gameState?.gameWon, inputFocused, initGame, seed]);

  const handleSeedChange = (newSeed: string) => {
    initGame(newSeed);
  };

  const handlePlayAgain = () => {
    initGame(seed);
  };

  const handleNewMaze = () => {
    const randomSeed = 'MAZE' + Date.now().toString(36).toUpperCase();
    initGame(randomSeed);
  };

  const toggleZoom = () => {
    setZoom(prev => prev === 1 ? 2 : 1);
  };

  if (!maze || !colors || !gameState) {
    return (
      <div style={styles.loading}>
        Loading maze...
      </div>
    );
  }

  return (
    <div style={styles.container} ref={gameContainerRef}>
      <div style={styles.header}>
        <SeedInput
          currentSeed={seed}
          onSeedChange={handleSeedChange}
          accentColor={colors.uiAccentColor}
          onFocusChange={setInputFocused}
        />
        <div style={styles.stats}>
          <span style={styles.stat}>
            Moves: {gameState.moveCount}
          </span>
          <span style={{ ...styles.stat, color: gameState.hasKey ? colors.keyColor : '#666' }}>
            {gameState.hasKey ? '🔑 Key collected!' : '🔑 Find the key'}
          </span>
          <button
            onClick={toggleZoom}
            style={{ ...styles.zoomButton, borderColor: colors.uiAccentColor }}
          >
            {zoom === 1 ? '🔍 Zoom In' : '🔍 Zoom Out'}
          </button>
        </div>
      </div>

      <div style={styles.mazeContainer}>
        <Maze
          maze={maze}
          playerPos={gameState.playerPos}
          keyPos={gameState.keyPos.x >= 0 ? gameState.keyPos : null}
          goalPos={gameState.goalPos}
          hasKey={gameState.hasKey}
          colors={colors}
          zoom={zoom}
          visited={visited}
        />
      </div>

      {isMobile && (
        <Controls
          onMove={handleMove}
          disabled={gameState.gameWon}
          accentColor={colors.uiAccentColor}
        />
      )}

      <WinModal
        isOpen={gameState.gameWon}
        moveCount={gameState.moveCount}
        seed={seed}
        onPlayAgain={handlePlayAgain}
        onNewMaze={handleNewMaze}
        colors={colors}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    flexShrink: 0,
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  stat: {
    fontSize: '14px',
    color: '#ccc',
  },
  zoomButton: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  mazeContainer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    color: '#ccc',
    fontSize: '18px',
  },
};
