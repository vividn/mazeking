import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { mazeFromLayoutBytes } from '../lib/mazeFromLayoutBytes';
import { addSeedToHistory } from '../lib/seedHistory';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze, type MazeHandle } from './Maze';
import { Controls } from './Controls';
import { WinModal } from './WinModal';
import { HeaderSeedInput } from './HeaderSeedInput';
import { HistorySidebar } from './HistorySidebar';
import { MazeSizeWarning } from './MazeSizeWarning';
import { Wordmark } from './Wordmark';
import { pickTextColor } from '../lib/contrastText';
import { DEFAULT_SEED } from '../App';
import robeUrl from '../glyphs/robe.png?url';
import scepterUrl from '../glyphs/scepter.png?url';

/**
 * Replay payload for an on-chain token. When set, Game decodes the layout
 * bytes via `mazeFromLayoutBytes` and uses the tokenId to derive a
 * mazeHash-aligned palette — no seed string required. This is how
 * MyMazes/Gallery hand off owned/registered tokens for replay regardless of
 * which device minted them.
 */
export interface ReplayPayload {
  layout: Uint8Array;
  tokenId: bigint;
  /** Optional original seed for display (unknown for tokens minted elsewhere). */
  seed?: string | null;
}

interface GameProps {
  initialSeed: string;
  onSeedChange: (seed: string) => void;
  active: boolean;
  /**
   * When non-null, the game replays the maze encoded in `replay.layout`
   * (decoded from on-chain bytes) instead of generating from `initialSeed`.
   * The parent flips this to null to return to seed-driven play.
   */
  replay: ReplayPayload | null;
}

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

const DIRECTION_TO_MOVE: Record<string, Move> = {
  up: 0, // Move.Up
  right: 1, // Move.Right
  down: 2, // Move.Down
  left: 3, // Move.Left
};

export function Game({ initialSeed, onSeedChange, active, replay }: GameProps) {
  const navigate = useNavigate();
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
  const [winModalDismissed, setWinModalDismissed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { isConnected } = useAccount();
  const [copied, setCopied] = useState(false);
  const [initialPositions, setInitialPositions] = useState<{
    startPos: Position;
    robePos: Position;
    scepterPos: Position;
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
  // We only do this while the / route is active so MyMazes/Gallery pages can
  // own their own page background without fighting the game's seed palette.
  useEffect(() => {
    if (!active || !colors) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.wallColor);
    document.body.style.backgroundColor = colors.pageBackgroundColor;
  }, [active, colors]);

  // Lock the layout while the mobile seed input is open so the soft keyboard
  // overlays the page instead of reflowing it. We:
  // 1. Toggle a `seed-input-open` class on html+body — paired CSS swaps
  //    `100dvh` (visual viewport, shrinks with keyboard) for `100vh` (large
  //    viewport, stable). iOS Safari relies on this.
  // 2. Append `interactive-widget=overlays-content` to the viewport meta —
  //    a hint Chrome 108+ honors to overlay the keyboard.
  useEffect(() => {
    if (!isMobile || !seedBarOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector(
      'meta[name="viewport"]'
    ) as HTMLMetaElement | null;
    const previousViewport = meta?.getAttribute('content') ?? null;
    html.classList.add('seed-input-open');
    body.classList.add('seed-input-open');
    if (
      meta &&
      previousViewport &&
      !previousViewport.includes('interactive-widget')
    ) {
      meta.setAttribute(
        'content',
        `${previousViewport}, interactive-widget=overlays-content`
      );
    }
    return () => {
      html.classList.remove('seed-input-open');
      body.classList.remove('seed-input-open');
      if (meta && previousViewport) {
        meta.setAttribute('content', previousViewport);
      }
    };
  }, [isMobile, seedBarOpen]);

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
        robePos: { ...generated.robePos },
        scepterPos: { ...generated.scepterPos },
        goalPos: { ...generated.goalPos },
      });

      // Initialize visited with starting position
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

  // Initialize game from a decoded on-chain layout (replay flow).
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

          // Check robe pickup
          if (
            prev.robePos &&
            newPos.x === prev.robePos.x &&
            newPos.y === prev.robePos.y
          ) {
            newState.hasRobe = true;
            newState.robePos = { x: -1, y: -1 };
          }

          // Check scepter pickup
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

  // Keyboard controls
  useEffect(() => {
    // Game routes own keyboard handling; on /mazes or /gallery the page is
    // responsible for any shortcuts it cares about, so we no-op here.
    if (!active) return;
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
    active,
    handleMove,
    gameState?.gameWon,
    seedBarOpen,
    historySidebarOpen,
    initGame,
    initFromReplay,
    replay,
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
    if (replay) {
      initFromReplay(replay);
    } else {
      initGame(seed);
    }
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
          <span
            style={{
              ...styles.stat,
              ...statMobileStyle,
              ...styles.statMobileMoves,
              backgroundColor: colors.uiAccentColor,
              color: buttonTextColor,
            }}
          >
            Moves: <strong>{gameState.moveCount}</strong>
          </span>
          <span
            style={{
              ...styles.stat,
              ...statMobileStyle,
              color: gameState.hasRobe ? colors.keyColor : '#888',
            }}
          >
            {gameState.hasRobe ? 'Robe ✓' : 'Find robe'}
          </span>
          <span
            style={{
              ...styles.stat,
              ...statMobileStyle,
              color: gameState.hasScepter ? colors.keyColor : '#888',
            }}
          >
            {gameState.hasScepter ? 'Scepter ✓' : 'Find scepter'}
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
              color: gameState.hasRobe ? colors.keyColor : '#888',
            }}
            title={gameState.hasRobe ? 'Robe collected' : 'Find the robe'}
          >
            <img aria-hidden src={robeUrl} alt="" style={styles.statSprite} />
            {gameState.hasRobe ? 'robe' : 'Find robe'}
          </span>
          <span
            style={{
              ...styles.statDesktop,
              color: gameState.hasScepter ? colors.keyColor : '#888',
            }}
            title={
              gameState.hasScepter ? 'Scepter collected' : 'Find the scepter'
            }
          >
            <img
              aria-hidden
              src={scepterUrl}
              alt=""
              style={styles.statSprite}
            />
            {gameState.hasScepter ? 'scepter' : 'Find scepter'}
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
          <>
            {seedBarOpen ? (
              <div
                style={{
                  ...styles.wordmarkRow,
                  ...styles.wordmarkRowMobile,
                }}
              >
                <HeaderSeedInput
                  onStartGame={handleSeedBarStart}
                  onCancel={handleSeedBarCancel}
                  accentColor={colors.uiAccentColor}
                  textColor={getContrastColor(colors.headerBackgroundColor)}
                  compact
                />
              </div>
            ) : (
              <>
                <div
                  style={{
                    ...styles.wordmarkRow,
                    ...styles.wordmarkRowMobile,
                  }}
                >
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
                  <div style={styles.headerSpacer} />
                  <button
                    onClick={() => setHistorySidebarOpen(true)}
                    style={{
                      ...styles.mobileIconButton,
                      borderColor: getContrastColor(
                        colors.headerBackgroundColor
                      ),
                      color: getContrastColor(colors.headerBackgroundColor),
                    }}
                    title="History"
                    aria-label="Open history"
                  >
                    🕘
                  </button>
                  <button
                    onClick={handleNewMaze}
                    style={{
                      ...styles.mobilePrimaryCta,
                      backgroundColor: colors.uiAccentColor,
                      color: buttonTextColor,
                    }}
                    title="Start a new game"
                    aria-label="New game"
                  >
                    + New
                  </button>
                </div>
                <div style={styles.mobileStatsRow}>{statsGroupNode}</div>
              </>
            )}
          </>
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
            {seedBarOpen ? (
              <HeaderSeedInput
                onStartGame={handleSeedBarStart}
                onCancel={handleSeedBarCancel}
                accentColor={colors.uiAccentColor}
                textColor={getContrastColor(colors.headerBackgroundColor)}
              />
            ) : (
              <>
                <div style={styles.headerSpacer} />
                <div style={styles.iconButtonRow}>
                  <button
                    onClick={handleCopyLink}
                    style={{
                      ...styles.iconButton,
                      borderColor: getContrastColor(
                        colors.headerBackgroundColor
                      ),
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
                      borderColor: getContrastColor(
                        colors.headerBackgroundColor
                      ),
                      color: getContrastColor(colors.headerBackgroundColor),
                    }}
                    title="History"
                    aria-label="Open history"
                  >
                    🕘
                  </button>
                  {isConnected && (
                    <button
                      onClick={() => navigate('/mazes')}
                      style={{
                        ...styles.iconButton,
                        borderColor: getContrastColor(
                          colors.headerBackgroundColor
                        ),
                        color: getContrastColor(colors.headerBackgroundColor),
                      }}
                      title="My Mazes"
                      aria-label="Go to my mazes"
                    >
                      👤
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/gallery')}
                    style={{
                      ...styles.iconButton,
                      borderColor: getContrastColor(
                        colors.headerBackgroundColor
                      ),
                      color: getContrastColor(colors.headerBackgroundColor),
                    }}
                    title="Gallery"
                    aria-label="Go to public gallery"
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
                        borderColor: getContrastColor(
                          colors.headerBackgroundColor
                        ),
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
              </>
            )}
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
          robePos={gameState.robePos.x >= 0 ? gameState.robePos : null}
          scepterPos={gameState.scepterPos.x >= 0 ? gameState.scepterPos : null}
          goalPos={gameState.goalPos}
          hasRobe={gameState.hasRobe}
          hasScepter={gameState.hasScepter}
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
          onHistory={() => setHistorySidebarOpen(true)}
          onShare={handleCopyLink}
          onRestart={handlePlayAgain}
          onViewCollection={() => navigate('/mazes')}
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
        onNewMaze={handleNewMaze}
        onDismiss={() => setWinModalDismissed(true)}
        colors={colors}
        onCopyLink={handleCopyLink}
        copied={copied}
        maze={maze}
        moves={gameState.moves}
        startPos={initialPositions.startPos}
        robePos={initialPositions.robePos}
        scepterPos={initialPositions.scepterPos}
        goalPos={initialPositions.goalPos}
        visited={visited}
        onViewCollection={() => {
          setWinModalDismissed(true);
          navigate('/mazes');
        }}
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
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    minWidth: 0,
    flexShrink: 1,
  },
  mobileStatsRow: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
  },
  mobileIconButton: {
    width: '40px',
    height: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.45)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
    flexShrink: 0,
  },
  mobilePrimaryCta: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    minHeight: '40px',
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
  statSprite: {
    width: '16px',
    height: '16px',
    objectFit: 'contain',
    imageRendering: 'pixelated',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  statMobile: {
    fontSize: '14px',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    color: '#f0f0f0',
  },
  statMobileMoves: {
    padding: '3px 10px',
    borderRadius: '999px',
    fontWeight: 700,
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
    paddingBottom: 'calc(86px + env(safe-area-inset-bottom, 0px))',
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
