import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ColorScheme } from '../types';
import { generateColorScheme } from '../lib/colorGenerator';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
import { getRandomPhrase } from '../lib/seedPhrases';
import { getRecentSeeds } from '../lib/seedHistory';

interface NewGameModalProps {
  isOpen: boolean;
  currentSeed: string;
  onStartGame: (seed: string) => void;
  onCancel: () => void;
}

export function NewGameModal({
  isOpen,
  currentSeed,
  onStartGame,
  onCancel,
}: NewGameModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [previewColors, setPreviewColors] = useState<ColorScheme | null>(null);
  const [shake, setShake] = useState(false);
  const [recentSeeds, setRecentSeeds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent seeds on open
  useEffect(() => {
    if (isOpen) {
      setRecentSeeds(getRecentSeeds().filter(s => s !== currentSeed).slice(0, 5));
      setInputValue('');
      // Focus input after a short delay to allow modal animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentSeed]);

  // Update preview colors when input changes
  useEffect(() => {
    const seedForPreview = inputValue.trim() || 'preview';
    setPreviewColors(generateColorScheme(seedForPreview));
  }, [inputValue]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    const lastChar = newValue.slice(-1);

    // Check if the new character is valid
    if (newValue.length > inputValue.length && lastChar && !isValidChar(lastChar)) {
      // Invalid character - trigger shake
      setShake(true);
      setTimeout(() => setShake(false), 300);
      // Filter to valid chars only
      newValue = filterToValidChars(newValue);
    }

    // Prevent multiple consecutive spaces
    newValue = newValue.replace(/  +/g, ' ');

    setInputValue(newValue);
  }, [inputValue]);

  const handleSubmit = useCallback(() => {
    const seed = inputValue.trim();
    if (seed) {
      onStartGame(seed);
    }
  }, [inputValue, onStartGame]);

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

  const handleRecentSeedClick = useCallback((seed: string) => {
    onStartGame(seed);
  }, [onStartGame]);

  if (!isOpen || !previewColors) return null;

  const accentColor = previewColors.uiAccentColor;
  const bgColor = previewColors.pathColor;

  return (
    <>
      <style>
        {`
          @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
          }
          .new-game-button:hover {
            filter: brightness(1.1);
          }
          .recent-seed:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
          }
        `}
      </style>
      <div
        style={styles.overlay}
        onClick={onCancel}
      >
        <div
          style={{
            ...styles.modal,
            backgroundColor: bgColor,
            boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 2px ${accentColor}`,
          }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="new-game-title"
          aria-modal="true"
        >
          <h2
            id="new-game-title"
            style={{ ...styles.title, color: previewColors.playerColor }}
          >
            New Game
          </h2>

          <div style={styles.inputSection}>
            <label style={{ ...styles.label, color: previewColors.wallColor }}>
              Enter Seed
            </label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a word or phrase..."
              style={{
                ...styles.input,
                borderColor: accentColor,
                animation: shake ? 'shake 0.3s ease-in-out' : undefined,
              }}
              aria-label="Seed input"
            />
            <div style={{ ...styles.hint, color: previewColors.wallColor }}>
              Colors preview as you type
            </div>
          </div>

          <button
            className="new-game-button"
            onClick={handleRandomPhrase}
            style={{
              ...styles.randomButton,
              backgroundColor: previewColors.textBackgroundColor,
              color: previewColors.pathColor,
            }}
          >
            Random Phrase
          </button>

          {recentSeeds.length > 0 && (
            <div style={styles.recentSection}>
              <div style={{ ...styles.recentLabel, color: previewColors.wallColor }}>
                Recent
              </div>
              <div style={styles.recentList}>
                {recentSeeds.map((seed) => (
                  <button
                    key={seed}
                    className="recent-seed"
                    onClick={() => handleRecentSeedClick(seed)}
                    style={{
                      ...styles.recentSeed,
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: previewColors.wallColor,
                    }}
                  >
                    {seed}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={styles.buttonRow}>
            <button
              className="new-game-button"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              style={{
                ...styles.primaryButton,
                backgroundColor: inputValue.trim() ? accentColor : '#555',
                color: previewColors.pathColor,
                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Start Game
            </button>
            <button
              className="new-game-button"
              onClick={onCancel}
              style={{
                ...styles.secondaryButton,
                backgroundColor: previewColors.wallColor,
                color: previewColors.pathColor,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modal: {
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '400px',
    width: '90%',
    animation: 'modalSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '24px',
    marginTop: 0,
  },
  inputSection: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '8px',
    opacity: 0.8,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    color: '#ffffff',
    border: '2px solid',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  },
  hint: {
    fontSize: '12px',
    marginTop: '6px',
    opacity: 0.5,
    fontStyle: 'italic',
  },
  randomButton: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '20px',
    transition: 'filter 0.15s ease',
  },
  recentSection: {
    marginBottom: '24px',
  },
  recentLabel: {
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '8px',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  recentSeed: {
    padding: '8px 12px',
    fontSize: '13px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'monospace',
    transition: 'background-color 0.15s ease',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
  },
  primaryButton: {
    flex: 1,
    padding: '14px',
    fontSize: '16px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    transition: 'filter 0.15s ease',
  },
  secondaryButton: {
    flex: 1,
    padding: '14px',
    fontSize: '16px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'filter 0.15s ease',
  },
};
