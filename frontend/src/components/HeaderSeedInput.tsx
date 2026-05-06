import { useCallback, useEffect, useRef, useState } from 'react';
import type { MazeData, ColorScheme } from '../types';
import { generateColorScheme } from '../lib/colorGenerator';
import { generateMaze } from '../lib/mazeGenerator';
import { isDebugSeedActive } from '../lib/debugSeed';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
import { Maze } from './Maze';
import { MazeSizeWarning } from './MazeSizeWarning';
import { pickTextColor } from '../lib/contrastText';

interface HeaderSeedInputProps {
  onStartGame: (seed: string) => void;
  onCancel: () => void;
  accentColor: string;
  textColor: string;
}

export function HeaderSeedInput({
  onStartGame,
  onCancel,
  accentColor,
  textColor,
}: HeaderSeedInputProps) {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);
  const [previewMaze, setPreviewMaze] = useState<MazeData | null>(null);
  const [previewColors, setPreviewColors] = useState<ColorScheme | null>(null);
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
      setPreviewColors(null);
      return;
    }

    const currentGeneration = generationRef.current;

    const scheduleGeneration = () => {
      const scheduleIdle =
        window.requestIdleCallback ??
        ((cb: () => void) => window.setTimeout(cb, 1));

      idleCallbackRef.current = scheduleIdle(() => {
        if (generationRef.current !== currentGeneration) return;

        const colors = generateColorScheme(seedForPreview);
        const maze = generateMaze(seedForPreview, {
          debug: isDebugSeedActive(seedForPreview),
        }).maze;

        if (generationRef.current === currentGeneration) {
          setPreviewColors(colors);
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

  const startTextColor = pickTextColor(accentColor);

  return (
    <div style={styles.row} className="header-seed-input">
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
      {previewMaze && previewColors && (
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
        placeholder="type a word or phrase..."
        aria-label="Maze seed"
        style={{
          ...styles.input,
          borderColor: accentColor,
          color: textColor,
          animation: shake ? 'headerSeedShake 0.3s ease-in-out' : undefined,
        }}
      />
      <button
        type="button"
        onClick={submit}
        style={{
          ...styles.startButton,
          backgroundColor: accentColor,
          color: startTextColor,
        }}
        title="Start new game (Enter)"
        aria-label="Start new game"
      >
        Start
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          ...styles.cancelButton,
          borderColor: textColor,
          color: textColor,
        }}
        title="Cancel (Esc)"
        aria-label="Cancel"
      >
        Cancel
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
};
