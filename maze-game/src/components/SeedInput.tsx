import React, { useState, FormEvent, KeyboardEvent } from 'react';

interface SeedInputProps {
  currentSeed: string;
  onSeedChange: (seed: string) => void;
  accentColor: string;
  onFocusChange?: (focused: boolean) => void;
}

export const SeedInput: React.FC<SeedInputProps> = ({
  currentSeed,
  onSeedChange,
  accentColor,
  onFocusChange,
}) => {
  const [inputValue, setInputValue] = useState(currentSeed);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmedValue = inputValue.trim();
    if (trimmedValue && trimmedValue !== currentSeed) {
      onSeedChange(trimmedValue);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div style={styles.container}>
      <label htmlFor="seed-input" style={styles.label}>
        Seed:
      </label>
      <input
        id="seed-input"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder="Enter seed"
        style={{
          ...styles.input,
          borderColor: accentColor,
        }}
        aria-label="Maze seed input"
      />
      <button
        onClick={() => handleSubmit()}
        style={{
          ...styles.button,
          backgroundColor: accentColor,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        aria-label="Generate maze with seed"
      >
        Generate
      </button>
      {currentSeed && (
        <span style={styles.currentSeed} title={`Current seed: ${currentSeed}`}>
          ({currentSeed})
        </span>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#1a1a1a',
    borderRadius: '6px',
    border: '1px solid #333',
  },
  label: {
    color: '#e0e0e0',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    userSelect: 'none',
  },
  input: {
    padding: '6px 10px',
    fontSize: '14px',
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    border: '1px solid',
    borderRadius: '4px',
    outline: 'none',
    fontFamily: 'monospace',
    minWidth: '120px',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  button: {
    padding: '6px 14px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'opacity 0.15s ease',
    userSelect: 'none',
  },
  currentSeed: {
    fontSize: '12px',
    color: '#888',
    fontFamily: 'monospace',
    maxWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
