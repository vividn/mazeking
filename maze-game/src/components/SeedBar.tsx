import { useState, useEffect, useRef, useCallback } from 'react';
import type { MazeData, ColorScheme } from '../types';
import { generateColorScheme } from '../lib/colorGenerator';
import { generateMaze } from '../lib/mazeGenerator';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
import { getRandomPhrase } from '../lib/seedPhrases';
import { Maze } from './Maze';

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

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setPreviewMaze(null);
      setPreviewColors(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const seedForPreview = inputValue.trim();
    if (seedForPreview) {
      setPreviewColors(generateColorScheme(seedForPreview));
      setPreviewMaze(generateMaze(seedForPreview).maze);
    } else {
      setPreviewMaze(null);
      setPreviewColors(null);
    }
  }, [inputValue, isOpen]);

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
    const seed = inputValue.trim();
    if (seed) {
      onStartGame(seed);
    } else {
      onCancel();
    }
  }, [inputValue, onStartGame, onCancel]);

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
