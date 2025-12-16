import { useState, useEffect } from 'react';
import type { ColorScheme } from '../types';
import { getRecentSeeds } from '../lib/seedHistory';

interface HistorySidebarProps {
  isOpen: boolean;
  currentSeed: string;
  colors: ColorScheme;
  onSelectSeed: (seed: string) => void;
  onClose: () => void;
}

export function HistorySidebar({
  isOpen,
  currentSeed,
  colors,
  onSelectSeed,
  onClose,
}: HistorySidebarProps) {
  const [seeds, setSeeds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSeeds(getRecentSeeds().filter(s => s !== currentSeed));
    }
  }, [isOpen, currentSeed]);

  if (!isOpen) return null;

  const bgColor = colors.pathColor;
  const accentColor = colors.uiAccentColor;
  const textColor = colors.wallColor;

  return (
    <>
      <style>
        {`
          @keyframes sidebarSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes overlayFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .history-seed-item:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
          }
        `}
      </style>

      <div
        style={styles.overlay}
        onClick={onClose}
      />

      <div
        style={{
          ...styles.sidebar,
          backgroundColor: bgColor,
          borderLeftColor: accentColor,
        }}
      >
        <div style={styles.header}>
          <h3 style={{ ...styles.title, color: textColor }}>History</h3>
          <button
            onClick={onClose}
            style={{
              ...styles.closeButton,
              color: textColor,
            }}
          >
            ×
          </button>
        </div>

        <div style={styles.list}>
          {seeds.length === 0 ? (
            <div style={{ ...styles.empty, color: textColor }}>
              No recent seeds
            </div>
          ) : (
            seeds.map((seed) => (
              <button
                key={seed}
                className="history-seed-item"
                onClick={() => {
                  onSelectSeed(seed);
                  onClose();
                }}
                style={{
                  ...styles.seedItem,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: textColor,
                }}
              >
                {seed}
              </button>
            ))
          )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    animation: 'overlayFadeIn 0.2s ease-out',
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '280px',
    maxWidth: '80vw',
    borderLeft: '3px solid',
    zIndex: 1001,
    animation: 'sidebarSlideIn 0.2s ease-out',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    padding: '0',
    lineHeight: 1,
    opacity: 0.7,
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  seedItem: {
    padding: '12px 14px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'monospace',
    transition: 'background-color 0.15s ease',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    opacity: 0.5,
    fontSize: '14px',
  },
};
