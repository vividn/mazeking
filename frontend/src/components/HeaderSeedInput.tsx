import { useCallback, useEffect, useRef, useState } from 'react';
import type { MazeData } from '../types';
import { useMazePaletteForSeed } from '../hooks/useMazePaletteForSeed';
import { generateMaze } from '../lib/mazeGenerator';
import { isDebugSeedActive } from '../lib/debugSeed';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze } from './Maze';
import { MazeSizeWarning } from './MazeSizeWarning';
import { pickTextColor } from '../lib/contrastText';

interface HeaderSeedInputProps {
  onStartGame: (seed: string) => void;
  onCancel: () => void;
  accentColor: string;
  textColor: string;
  /** When true, layout adjusts for mobile header (compact spacing, smaller buttons). */
  compact?: boolean;
}

export function HeaderSeedInput({
  onStartGame,
  onCancel,
  accentColor,
  textColor,
  compact = false,
}: HeaderSeedInputProps) {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);
  const [previewSeed, setPreviewSeed] = useState<string>('');
  const [previewMaze, setPreviewMaze] = useState<MazeData | null>(null);
  // Drive preview colors through the same hook the live game uses so they
  // resolve to the same hash-aligned palette (ma-09y).
  const previewColors = useMazePaletteForSeed(previewSeed);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const idleCallbackRef = useRef<number | null>(null);

  const cancelPendingPreview = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (idleCallbackRef.current) {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(idleCallbackRef.current);
      }
      idleCallbackRef.current = null;
    }
    generationRef.current++;
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  // Debounced, low-priority preview generation
  useEffect(() => {
    cancelPendingPreview();

    const seedForPreview = value.trim();
    if (!seedForPreview) {
      setPreviewMaze(null);
      setPreviewSeed('');
      return;
    }

    const currentGeneration = generationRef.current;

    const scheduleGeneration = () => {
      const scheduleIdle =
        window.requestIdleCallback ??
        ((cb: () => void) => window.setTimeout(cb, 1));

      idleCallbackRef.current = scheduleIdle(() => {
        if (generationRef.current !== currentGeneration) return;

        const maze = generateMaze(seedForPreview, {
          debug: isDebugSeedActive(seedForPreview),
        }).maze;

        if (generationRef.current === currentGeneration) {
          setPreviewSeed(seedForPreview);
          setPreviewMaze(maze);
        }
      });
    };

    if (value.endsWith(' ')) {
      scheduleGeneration();
    } else {
      debounceTimerRef.current = window.setTimeout(scheduleGeneration, 300);
    }
  }, [value, cancelPendingPreview]);

  useEffect(() => {
    return () => cancelPendingPreview();
  }, [cancelPendingPreview]);

  // Tap outside the input root while empty → cancel.
  // Non-empty input is preserved (outside tap does nothing).
  // Listen on pointerdown (covers both mouse + touch) at the document level.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target;
      if (target instanceof Node && root.contains(target)) return;
      if (value.trim() === '') {
        onCancel();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [value, onCancel]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let next = e.target.value;
      const lastChar = next.slice(-1);
      if (next.length > value.length && lastChar && !isValidChar(lastChar)) {
        setShake(true);
        window.setTimeout(() => setShake(false), 300);
        next = filterToValidChars(next);
      }
      next = next.replace(/  +/g, ' ');
      setValue(next);
    },
    [value]
  );

  const submit = useCallback(() => {
    cancelPendingPreview();
    const seed = value.trim();
    if (seed) onStartGame(seed);
    else onCancel();
  }, [value, onStartGame, onCancel, cancelPendingPreview]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [submit, onCancel]
  );

  const handleRandomPhrase = useCallback(() => {
    const phrase = getRandomPhrase();
    setValue(phrase);
    inputRef.current?.focus();
  }, []);

  const startTextColor = pickTextColor(accentColor);
  const isEmpty = value.trim() === '';

  return (
    <div
      ref={rootRef}
      style={compact ? { ...styles.row, ...styles.rowCompact } : styles.row}
      className="header-seed-input"
    >
      <style>
        {`
          @keyframes headerSeedShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-3px); }
            75% { transform: translateX(3px); }
          }
          @keyframes headerSeedFadeIn {
            from { opacity: 0; transform: translateX(8px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .header-seed-input {
            animation: headerSeedFadeIn 180ms ease-out;
          }
          @media (prefers-reduced-motion: reduce) {
            .header-seed-input { animation: none; }
            .header-seed-input input { animation: none !important; }
          }
        `}
      </style>
      {previewMaze && previewSeed && (
        <div
          style={{
            ...styles.previewOverlay,
            backgroundColor: previewColors.pageBackgroundColor,
          }}
        >
          <MazeSizeWarning
            width={previewMaze.width}
            height={previewMaze.height}
          />
          <Maze
            maze={previewMaze}
            playerPos={{ x: 0, y: 0 }}
            robePos={null}
            scepterPos={null}
            goalPos={{ x: 0, y: 0 }}
            hasRobe={false}
            hasScepter={false}
            colors={previewColors}
            zoom={1}
            visited={new Set()}
            showEntities={false}
          />
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={compact ? 'word or phrase…' : 'type a word or phrase...'}
        aria-label="Maze seed"
        style={{
          ...styles.input,
          ...(compact ? styles.inputCompact : null),
          borderColor: accentColor,
          color: textColor,
          animation: shake ? 'headerSeedShake 0.3s ease-in-out' : undefined,
        }}
      />
      {compact && isEmpty && (
        <button
          type="button"
          onClick={handleRandomPhrase}
          style={{
            ...styles.surpriseButtonCompact,
            backgroundColor: accentColor,
            color: startTextColor,
          }}
          title="Surprise me with a random phrase"
          aria-label="Surprise me — random phrase"
        >
          🎲
        </button>
      )}
      {(!compact || !isEmpty) && (
        <button
          type="button"
          onClick={submit}
          style={{
            ...styles.startButton,
            ...(compact ? styles.startButtonCompact : null),
            backgroundColor: accentColor,
            color: startTextColor,
          }}
          title="Start new game (Enter)"
          aria-label="Start new game"
        >
          Start
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        style={{
          ...styles.cancelButton,
          ...(compact ? styles.cancelButtonCompact : null),
          borderColor: textColor,
          color: textColor,
        }}
        title="Cancel (Esc)"
        aria-label="Cancel"
      >
        {compact ? '✕' : 'Cancel'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  rowCompact: {
    gap: '6px',
    width: '100%',
    justifyContent: 'stretch',
  },
  previewOverlay: {
    position: 'fixed',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#1a1a1a',
  },
  input: {
    flex: '1 1 240px',
    minWidth: 0,
    maxWidth: '420px',
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    border: '2px solid',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  inputCompact: {
    flex: '1 1 0',
    minWidth: 0,
    maxWidth: 'none',
    fontSize: '16px',
    padding: '8px 10px',
  },
  startButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  startButtonCompact: {
    padding: '8px 12px',
    fontSize: '14px',
    minHeight: '40px',
  },
  surpriseButtonCompact: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    minHeight: '40px',
    minWidth: '40px',
    lineHeight: 1,
  },
  cancelButton: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  cancelButtonCompact: {
    padding: '6px 10px',
    fontSize: '16px',
    minHeight: '40px',
    minWidth: '40px',
    lineHeight: 1,
  },
};
