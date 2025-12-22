import { useState, useEffect, useRef, useCallback } from 'react';
import type { MazeData, ColorScheme } from '../types';
import { generateColorScheme } from '../lib/colorGenerator';
import { generateMaze } from '../lib/mazeGenerator';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze } from './Maze';
import { MazeSizeWarning } from './MazeSizeWarning';

interface SeedBarProps {
  isOpen: boolean;
  onStartGame: (seed: string) => void;
  onCancel: () => void;
}

export function SeedBar({ isOpen, onStartGame, onCancel }: SeedBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [previewMaze, setPreviewMaze] = useState<MazeData | null>(null);
  const [previewColors, setPreviewColors] = useState<ColorScheme | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const idleCallbackRef = useRef<number | null>(null);

  // Helper to cancel all pending preview work
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
    if (isOpen) {
      setInputValue('');
      setPreviewMaze(null);
      setPreviewColors(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      cancelPendingPreview();
    }
  }, [isOpen, cancelPendingPreview]);

  // Debounced, low-priority preview generation
  useEffect(() => {
    if (!isOpen) return;

    // Cancel any pending generation
    cancelPendingPreview();

    const seedForPreview = inputValue.trim();
    if (!seedForPreview) {
      setPreviewMaze(null);
      setPreviewColors(null);
      return;
    }

    const currentGeneration = generationRef.current;

    const scheduleGeneration = () => {
      // Use requestIdleCallback for low-priority execution (with setTimeout fallback)
      const scheduleIdle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1));

      idleCallbackRef.current = scheduleIdle(() => {
        // Check if this generation is still current
        if (generationRef.current !== currentGeneration) return;

        const colors = generateColorScheme(seedForPreview);
        const maze = generateMaze(seedForPreview).maze;

        // Double-check before updating state
        if (generationRef.current === currentGeneration) {
          setPreviewColors(colors);
          setPreviewMaze(maze);
        }
      });
    };

    // Trigger immediately on space (new word), otherwise debounce
    if (inputValue.endsWith(' ')) {
      scheduleGeneration();
    } else {
      debounceTimerRef.current = window.setTimeout(scheduleGeneration, 300);
    }
  }, [inputValue, isOpen, cancelPendingPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelPendingPreview();
  }, [cancelPendingPreview]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    const lastChar = newValue.slice(-1);

    if (newValue.length > inputValue.length && lastChar && !isValidChar(lastChar)) {
      setShake(true);
      setTimeout(() => setShake(false), 300);
      newValue = filterToValidChars(newValue);
    }

    newValue = newValue.replace(/  +/g, ' ');
    setInputValue(newValue);
  }, [inputValue]);

  const handleSubmit = useCallback(() => {
    cancelPendingPreview();
    const seed = inputValue.trim();
    if (seed) {
      onStartGame(seed);
    } else {
      onCancel();
    }
  }, [inputValue, onStartGame, onCancel, cancelPendingPreview]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  const handleRandomPhrase = useCallback(() => {
    const phrase = getRandomPhrase();
    setInputValue(phrase);
    inputRef.current?.focus();
  }, []);

  if (!isOpen) return null;

  const barBgColor = previewColors?.pathColor || '#2a2a2a';
  const accentColor = previewColors?.uiAccentColor || '#666';
  const textColor = previewColors?.wallColor || '#ccc';

  return (
    <>
      <style>
        {`
          @keyframes seedBarSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
          }
          .seed-bar-random:hover {
            filter: brightness(1.2);
          }
        `}
      </style>

      {previewMaze && previewColors && (
        <div style={styles.previewOverlay}>
          <MazeSizeWarning width={previewMaze.width} height={previewMaze.height} />
          <Maze
            maze={previewMaze}
            playerPos={{ x: 0, y: 0 }}
            keyPos={null}
            goalPos={{ x: 0, y: 0 }}
            hasKey={false}
            colors={previewColors}
            zoom={1}
            visited={new Set()}
            showEntities={false}
          />
        </div>
      )}

      <div
        style={{
          ...styles.bar,
          backgroundColor: barBgColor,
          borderTopColor: accentColor,
        }}
      >
        <div style={styles.barContent}>
          <span style={{ ...styles.label, color: textColor }}>Seed:</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="type a word or phrase..."
            style={{
              ...styles.input,
              borderColor: accentColor,
              animation: shake ? 'shake 0.3s ease-in-out' : undefined,
            }}
          />
          <button
            className="seed-bar-random"
            onClick={handleRandomPhrase}
            style={{
              ...styles.randomButton,
              backgroundColor: accentColor,
              color: barBgColor,
            }}
            title="Generate random phrase (Shift+N)"
          >
            Random
          </button>
          <span style={{ ...styles.hint, color: textColor }}>
            Enter to start · Esc to cancel
          </span>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewOverlay: {
    position: 'fixed',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: '#1a1a1a',
  },
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60px',
    borderTop: '3px solid',
    zIndex: 1000,
    animation: 'seedBarSlideUp 0.2s ease-out',
    display: 'flex',
    alignItems: 'center',
  },
  barContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 20px',
    width: '100%',
  },
  label: {
    fontSize: '16px',
    fontWeight: 600,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    maxWidth: '400px',
    padding: '10px 14px',
    fontSize: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#ffffff',
    border: '2px solid',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  randomButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'filter 0.15s ease',
    flexShrink: 0,
  },
  hint: {
    fontSize: '13px',
    opacity: 0.6,
    marginLeft: 'auto',
    flexShrink: 0,
  },
};
