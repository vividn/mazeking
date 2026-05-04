import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type {
  GameState,
  MazeData,
  Move,
  ColorScheme,
  Position,
} from '../types';
import { generateMaze, canMove, getNewPosition } from '../lib/mazeGenerator';
import { isDebugSeedActive } from '../lib/debugSeed';
import { generateColorScheme } from '../lib/colorGenerator';
import { computeMazeHash } from '../lib/mazeIdentity';
import { layoutBytesForSeed } from '../lib/tokenId';
import { addSeedToHistory } from '../lib/seedHistory';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze, type MazeHandle } from './Maze';
import { Controls } from './Controls';
import { WinModal } from './WinModal';
import { SeedBar } from './SeedBar';
import { HistorySidebar } from './HistorySidebar';
import { MyMazesSidebar } from './MyMazesSidebar';
import { PublicGallerySidebar } from './PublicGallerySidebar';
import { MazeSizeWarning } from './MazeSizeWarning';
import { Wordmark } from './Wordmark';
import { pickTextColor } from '../lib/contrastText';
import { DEFAULT_SEED } from '../App';

interface GameProps {
  initialSeed: string;
  onSeedChange: (seed: string) => void;
}

const DIRECTION_TO_MOVE: Record<string, Move> = {
  up: 0, // Move.Up
  right: 1, // Move.Right
  down: 2, // Move.Down
  left: 3, // Move.Left
};

export function Game({ initialSeed, onSeedChange }: GameProps) {
  const mazeRef = useRef<MazeHandle>(null);
  const [seed, setSeed] = useState(initialSeed);
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [colors, setColors] = useState<ColorScheme | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [seedBarOpen, setSeedBarOpen] = useState(false);
  // Regalia hint bubble — true while the player is standing on the goal cell
  // without regalia. Cleared as soon as they step away.
  const [showKinglyHint, setShowKinglyHint] = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [myMazesSidebarOpen, setMyMazesSidebarOpen] = useState(false);
  const [winModalDismissed, setWinModalDismissed] = useState(false);
  const [gallerySidebarOpen, setGallerySidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { isConnected } = useAccount();
  const [copied, setCopied] = useState(false);
  const [initialPositions, setInitialPositions] = useState<{
    startPos: Position;
    keyPos: Position;
    goalPos: Position;
  } | null>(null);
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

  // Sync mobile status-bar theme-color to seed's wall color, and tint the
  // page background so the chrome around the maze shares the seed's palette.
  useEffect(() => {
    if (!colors) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.wallColor);
    document.body.style.backgroundColor = colors.pageBackgroundColor;
  }, [colors]);

  // Initialize game from seed
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
          const layout = layoutBytesForSeed(newSeed);
          const hash = await computeMazeHash(layout);
          // Guard against a stale upgrade landing on a newer seed.
          setSeed((current) => {
            if (current === newSeed) {
              setColors(generateColorScheme(newSeed, { mazeHash: hash }));
            }
            return current;
          });
        } catch (err) {
          // If WASM init or hashing fails we just keep the seed-only colors;
          // proof/mint will surface its own error path.
          console.warn('Failed to compute maze hash for color alignment:', err);
        }
      })();

      // Store initial positions for ZK proof generation
      setInitialPositions({
        startPos: { ...generated.kingPos },
        keyPos: { ...generated.keyPos },
        goalPos: { ...generated.goalPos },
      });

      // Initialize visited with starting position
      const startKey = `${generated.kingPos.x},${generated.kingPos.y}`;
      setVisited(new Set([startKey]));
      setShowKinglyHint(false);

      setGameState({
        playerPos: { ...generated.kingPos },
        keyPos: { ...generated.keyPos },
        goalPos: { ...generated.goalPos },
        hasKey: false,
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

  // Initialize on mount or seed change
  useEffect(() => {
    initGame(initialSeed);
  }, [initialSeed, initGame]);

  // Handle movement
  const handleMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!maze || !gameState || gameState.gameWon) return;

      if (canMove(maze, gameState.playerPos, direction)) {
        const newPos = getNewPosition(maze, gameState.playerPos, direction);

        // Add new position to visited
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

          // Check if picked up key
          if (
            prev.keyPos &&
            newPos.x === prev.keyPos.x &&
            newPos.y === prev.keyPos.y
          ) {
            newState.hasKey = true;
            newState.keyPos = { x: -1, y: -1 }; // Mark as collected
          }

          const reachedGoal =
            newPos.x === prev.goalPos.x && newPos.y === prev.goalPos.y;

          // Reaching the crown only wins when wearing regalia. Without it,
          // surface the hint instead — the goal stays unclaimed.
          if (reachedGoal && newState.hasKey) {
            newState.gameWon = true;
            setShowKinglyHint(false);
          } else if (reachedGoal && !newState.hasKey) {
            setShowKinglyHint(true);
          } else {
            // Stepping off the goal cell clears the hint.
            setShowKinglyHint(false);
          }

          return newState;
        });
      }
    },
    [maze, gameState]
  );

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

      // Same for the My Mazes sidebar — let Escape close it, swallow others.
      if (myMazesSidebarOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setMyMazesSidebarOpen(false);
        }
        return;
      }

      // And the Public Gallery sidebar.
      if (gallerySidebarOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setGallerySidebarOpen(false);
        }
        return;
      }

      // R key restarts the game (works even when won)
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        initGame(seed);
        return;
      }

      // 0 key resets the maze pan/zoom transform (works even when won).
      if (e.key === '0') {
        e.preventDefault();
        mazeRef.current?.resetView();
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
  }, [
    handleMove,
    gameState?.gameWon,
    seedBarOpen,
    historySidebarOpen,
    myMazesSidebarOpen,
    gallerySidebarOpen,
    initGame,
    seed,
  ]);

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

  const handleResetToDefault = useCallback(() => {
    initGame(DEFAULT_SEED);
  }, [initGame]);

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

  if (!maze || !colors || !gameState || !initialPositions) {
    return <div style={styles.loading}>Loading maze...</div>;
  }

  const getContrastColor = pickTextColor;
  const buttonTextColor = getContrastColor(colors.uiAccentColor);
  const debugMode = isDebugSeedActive(seed);
  const statMobileStyle = isMobile ? styles.statMobile : null;
  const statsGroupNode = (
    <div
      style={{
        ...styles.statsGroup,
        ...(isMobile ? styles.statsGroupMobile : styles.statsGroupDesktop),
      }}
    >
      {isMobile ? (
        <>
          <span style={{ ...styles.stat, ...statMobileStyle }}>
            Moves: <strong>{gameState.moveCount}</strong>
          </span>
          <span
            style={{
              ...styles.stat,
              ...statMobileStyle,
              color: gameState.hasKey ? colors.keyColor : '#888',
            }}
          >
            {gameState.hasKey ? 'Regalia collected!' : 'Find the regalia'}
          </span>
        </>
      ) : (
        <>
          <span
            style={styles.statDesktop}
            title={`Moves: ${gameState.moveCount}`}
          >
            <span aria-hidden style={styles.statIcon}>
              🚶
            </span>
            <strong>{gameState.moveCount}</strong>
          </span>
          <span
            style={{
              ...styles.statDesktop,
              color: gameState.hasKey ? colors.keyColor : '#888',
            }}
            title={gameState.hasKey ? 'Regalia collected' : 'Find the regalia'}
          >
            <span aria-hidden style={styles.statIcon}>
              ⚜
            </span>
            {gameState.hasKey ? 'collected' : 'Find regalia'}
          </span>
        </>
      )}
      {debugMode && (
        <span
          style={{
            ...styles.stat,
            ...statMobileStyle,
            padding: '2px 6px',
            border: `1px solid ${colors.uiAccentColor}`,
            borderRadius: '4px',
            color: colors.uiAccentColor,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
          title="Debug seed active: 66% of internal walls removed (localhost only)"
        >
          [DEBUG]
        </span>
      )}
    </div>
  );

  return (
    <div style={styles.container} ref={gameContainerRef}>
      <div
        style={{
          ...styles.header,
          ...(isMobile ? styles.headerMobile : styles.headerDesktop),
          backgroundColor: colors.headerBackgroundColor,
        }}
      >
        {isMobile ? (
          <div
            style={{
              ...styles.wordmarkRow,
              ...styles.wordmarkRowMobile,
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <Wordmark
                text={'maze♚\n♚king'}
                pixelSize={3}
                color={colors.textBackgroundColor}
                zkColor={colors.zkBackgroundColor}
                crownColor={colors.crownBackgroundColor}
                ariaLabel="MAZEKING"
              />
            </div>
            {statsGroupNode}
          </div>
        ) : (
          <div style={styles.headerRowDesktop}>
            <button
              type="button"
              onClick={handleResetToDefault}
              style={styles.wordmarkButton}
              aria-label="Reset to initial maze"
              title="Reset to initial maze"
            >
              <Wordmark
                text={'maze♚\n♚king'}
                pixelSize={3}
                color={colors.textBackgroundColor}
                zkColor={colors.zkBackgroundColor}
                crownColor={colors.crownBackgroundColor}
                ariaLabel="MAZEKING"
              />
            </button>
            {statsGroupNode}
            <div style={styles.headerSpacer} />
            <div style={styles.iconButtonRow}>
              <button
                onClick={handleCopyLink}
                style={{
                  ...styles.iconButton,
                  borderColor: getContrastColor(colors.headerBackgroundColor),
                  color: getContrastColor(colors.headerBackgroundColor),
                }}
                title={copied ? 'Copied!' : 'Copy link to clipboard'}
                aria-label="Share — copy link to clipboard"
              >
                {copied ? '✓' : '🔗'}
              </button>
              <button
                onClick={() => setHistorySidebarOpen(true)}
                style={{
                  ...styles.iconButton,
                  borderColor: getContrastColor(colors.headerBackgroundColor),
                  color: getContrastColor(colors.headerBackgroundColor),
                }}
                title="History"
                aria-label="Open history"
              >
                🕘
              </button>
              {isConnected && (
                <button
                  onClick={() => setMyMazesSidebarOpen(true)}
                  style={{
                    ...styles.iconButton,
                    borderColor: getContrastColor(colors.headerBackgroundColor),
                    color: getContrastColor(colors.headerBackgroundColor),
                  }}
                  title="My Mazes"
                  aria-label="Open my mazes"
                >
                  👤
                </button>
              )}
              <button
                onClick={() => setGallerySidebarOpen(true)}
                style={{
                  ...styles.iconButton,
                  borderColor: getContrastColor(colors.headerBackgroundColor),
                  color: getContrastColor(colors.headerBackgroundColor),
                }}
                title="Gallery"
                aria-label="Open public gallery"
              >
                🖼
              </button>
              <div
                style={styles.helpWrapper}
                onMouseEnter={() => setHelpOpen(true)}
                onMouseLeave={() => setHelpOpen(false)}
              >
                <button
                  onClick={() => setHelpOpen((v) => !v)}
                  onFocus={() => setHelpOpen(true)}
                  onBlur={() => setHelpOpen(false)}
                  style={{
                    ...styles.iconButton,
                    borderColor: getContrastColor(colors.headerBackgroundColor),
                    color: getContrastColor(colors.headerBackgroundColor),
                  }}
                  title="Keyboard shortcuts"
                  aria-label="Show keyboard shortcuts"
                  aria-expanded={helpOpen}
                >
                  ?
                </button>
                {helpOpen && (
                  <div
                    role="tooltip"
                    style={{
                      ...styles.helpPopover,
                      backgroundColor: colors.wallColor,
                      color: getContrastColor(colors.wallColor),
                      borderColor: getContrastColor(colors.wallColor),
                    }}
                  >
                    <div style={styles.helpRow}>
                      <kbd style={styles.kbd}>Arrows</kbd>
                      <kbd style={styles.kbd}>WASD</kbd>
                      <span>move</span>
                    </div>
                    <div style={styles.helpRow}>
                      <kbd style={styles.kbd}>R</kbd>
                      <span>restart</span>
                    </div>
                    <div style={styles.helpRow}>
                      <kbd style={styles.kbd}>N</kbd>
                      <span>new</span>
                    </div>
                    <div style={styles.helpRow}>
                      <kbd style={styles.kbd}>0</kbd>
                      <span>reset zoom</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setSeedBarOpen(true)}
              style={{
                ...styles.primaryCta,
                backgroundColor: colors.uiAccentColor,
                color: buttonTextColor,
              }}
              title="Start a new game with a custom seed"
              aria-label="New game"
            >
              + New Game
            </button>
          </div>
        )}
      </div>

      <MazeSizeWarning width={maze.width} height={maze.height} />

      <div
        style={{
          ...styles.mazeContainer,
          ...(isMobile ? styles.mazeContainerMobile : null),
        }}
      >
        <Maze
          ref={mazeRef}
          maze={maze}
          playerPos={gameState.playerPos}
          keyPos={gameState.keyPos.x >= 0 ? gameState.keyPos : null}
          goalPos={gameState.goalPos}
          hasKey={gameState.hasKey}
          colors={colors}
          zoom={1}
          visited={visited}
          enableTouchTransform={isMobile}
          enableMouseTransform={!isMobile}
          showKinglyHint={showKinglyHint}
        />
      </div>

      {isMobile && !seedBarOpen && (
        <Controls
          onMove={handleMove}
          onNewGame={handleNewMaze}
          onHistory={() => setHistorySidebarOpen(true)}
          onShare={handleCopyLink}
          onRestart={handlePlayAgain}
          disabled={gameState.gameWon}
          accentColor={colors.uiAccentColor}
          wallColor={colors.wallColor}
          textBackgroundColor={colors.textBackgroundColor}
          copied={copied}
        />
      )}

      <WinModal
        isOpen={gameState.gameWon && !winModalDismissed}
        moveCount={gameState.moveCount}
        seed={seed}
        onPlayAgain={handlePlayAgain}
        onNewMaze={handleNewMaze}
        colors={colors}
        onCopyLink={handleCopyLink}
        copied={copied}
        maze={maze}
        moves={gameState.moves}
        startPos={initialPositions.startPos}
        keyPos={initialPositions.keyPos}
        goalPos={initialPositions.goalPos}
        visited={visited}
        onViewCollection={() => {
          setWinModalDismissed(true);
          setMyMazesSidebarOpen(true);
        }}
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

      <MyMazesSidebar
        isOpen={myMazesSidebarOpen}
        colors={colors}
        onSelectSeed={handleHistorySelect}
        onClose={() => setMyMazesSidebarOpen(false)}
      />

      <PublicGallerySidebar
        isOpen={gallerySidebarOpen}
        colors={colors}
        onSelectSeed={handleHistorySelect}
        onClose={() => setGallerySidebarOpen(false)}
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
  headerDesktop: {
    padding: '6px 16px',
    gap: 0,
    minHeight: '52px',
  },
  headerMobile: {
    padding: '6px 12px',
    gap: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  headerRowDesktop: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    minHeight: '40px',
  },
  wordmarkRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  wordmarkRowMobile: {
    justifyContent: 'space-between',
    gap: '12px',
  },
  wordmarkButton: {
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'opacity 0.15s ease',
  },
  statsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  statsGroupDesktop: {
    gap: '14px',
    whiteSpace: 'nowrap',
  },
  statsGroupMobile: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    minWidth: 0,
    flexShrink: 1,
  },
  stat: {
    fontSize: '15px',
    color: '#ddd',
  },
  statDesktop: {
    fontSize: '14px',
    color: '#ddd',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  statIcon: {
    fontSize: '14px',
    lineHeight: 1,
  },
  statMobile: {
    fontSize: '12px',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  headerSpacer: {
    flex: 1,
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
  iconButtonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  iconButton: {
    width: '36px',
    height: '36px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
  helpWrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
  helpPopover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: '180px',
    padding: '8px 10px',
    border: '1px solid',
    borderRadius: '6px',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
    zIndex: 10,
    whiteSpace: 'nowrap',
  },
  helpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  primaryCta: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    transition: 'filter 0.15s ease, transform 0.1s ease',
  },
  mazeContainer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mazeContainerMobile: {
    paddingBottom: 'calc(58px + env(safe-area-inset-bottom, 0px))',
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
