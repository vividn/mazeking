import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, MazeData, Move, ColorScheme } from '../types';
import { generateMaze, canMove, getNewPosition } from '../lib/mazeGenerator';
import { generateColorScheme } from '../lib/colorGenerator';
import { addSeedToHistory } from '../lib/seedHistory';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze } from './Maze';
import { Controls } from './Controls';
import { WinModal } from './WinModal';
import { SeedBar } from './SeedBar';
import { HistorySidebar } from './HistorySidebar';

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
  const [seedBarOpen, setSeedBarOpen] = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
    addSeedToHistory(newSeed);
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

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle game keys when seed bar is open (input captures keys)
      if (seedBarOpen) return;

      // Don't handle keys when history sidebar is open
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
        initGame(seed);
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
  }, [handleMove, gameState?.gameWon, seedBarOpen, historySidebarOpen, initGame, seed]);

  const handleSeedBarStart = (newSeed: string) => {
    initGame(newSeed);
    setSeedBarOpen(false);
  };

  const handleSeedBarCancel = () => {
    setSeedBarOpen(false);
  };

  const handlePlayAgain = () => {
    initGame(seed);
  };

  const handleNewMaze = () => {
    setSeedBarOpen(true);
  };

  const handleHistorySelect = (selectedSeed: string) => {
    initGame(selectedSeed);
  };

  const toggleZoom = () => {
    setZoom(prev => prev === 1 ? 2 : 1);
  };

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  if (!maze || !colors || !gameState) {
    return (
      <div style={styles.loading}>
        Loading maze...
      </div>
    );
  }

  // Calculate contrasting text color for buttons
  const getContrastColor = (bgColor: string): string => {
    // Parse hex color
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  const buttonTextColor = getContrastColor(colors.uiAccentColor);

  return (
    <div style={styles.container} ref={gameContainerRef}>
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div style={styles.statsGroup}>
            <span style={styles.stat}>
              Moves: <strong>{gameState.moveCount}</strong>
            </span>
            <span style={{ ...styles.stat, color: gameState.hasKey ? colors.keyColor : '#888' }}>
              {gameState.hasKey ? 'Key collected!' : 'Find the key'}
            </span>
          </div>
          <div style={styles.keymap}>
            <span style={styles.keymapItem}>Move: <kbd style={styles.kbd}>Arrows</kbd> <kbd style={styles.kbd}>WASD</kbd></span>
            <span style={styles.keymapItem}>Restart: <kbd style={styles.kbd}>R</kbd></span>
            <span style={styles.keymapItem}>New: <kbd style={styles.kbd}>N</kbd></span>
          </div>
          <div style={styles.headerButtons}>
            <button
              onClick={toggleZoom}
              style={{ ...styles.actionButton, backgroundColor: colors.wallColor, color: getContrastColor(colors.wallColor) }}
            >
              {zoom === 1 ? 'Zoom In' : 'Zoom Out'}
            </button>
            <button
              onClick={handleCopyLink}
              style={{ ...styles.actionButton, backgroundColor: colors.textBackgroundColor, color: getContrastColor(colors.textBackgroundColor) }}
              title="Copy link to clipboard"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
            <button
              onClick={() => setHistorySidebarOpen(true)}
              style={{ ...styles.actionButton, backgroundColor: colors.wallColor, color: getContrastColor(colors.wallColor) }}
            >
              History
            </button>
            <button
              onClick={() => setSeedBarOpen(true)}
              style={{ ...styles.actionButton, backgroundColor: colors.uiAccentColor, color: buttonTextColor }}
            >
              New Game
            </button>
          </div>
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
        onCopyLink={handleCopyLink}
        copied={copied}
      />

      <SeedBar
        isOpen={seedBarOpen}
        onStartGame={handleSeedBarStart}
        onCancel={handleSeedBarCancel}
      />

      <HistorySidebar
        isOpen={historySidebarOpen}
        currentSeed={seed}
        colors={colors}
        onSelectSeed={handleHistorySelect}
        onClose={() => setHistorySidebarOpen(false)}
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
    padding: '12px 16px',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  stat: {
    fontSize: '15px',
    color: '#ddd',
  },
  keymap: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  keymapItem: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  kbd: {
    display: 'inline-block',
    padding: '2px 6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  headerButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  actionButton: {
    padding: '10px 18px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'filter 0.15s ease, transform 0.1s ease',
    whiteSpace: 'nowrap',
  },
  mazeContainer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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
