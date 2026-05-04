import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidChar, filterToValidChars } from '../lib/pixelFont';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

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
    const seed = value.trim();
    if (seed) onStartGame(seed);
    else onCancel();
  }, [value, onStartGame, onCancel]);

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
