import { useEffect } from 'react';
import { pickTextColor } from '../lib/contrastText';
import type { ColorScheme } from '../types';

interface MazeLightboxProps {
  imageUrl: string | null;
  seed: string | null;
  /** Shown when seed is unknown — usually a short token id. */
  fallbackLabel?: string;
  colors: ColorScheme;
  onClose: () => void;
  onPlay?: () => void;
}

export function MazeLightbox({
  imageUrl,
  seed,
  fallbackLabel,
  colors,
  onClose,
  onPlay,
}: MazeLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const fg = pickTextColor(colors.headerBackgroundColor);
  const accentFg = pickTextColor(colors.uiAccentColor);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Maze details"
      onClick={onClose}
      style={styles.backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...styles.panel,
          backgroundColor: colors.headerBackgroundColor,
          color: fg,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          style={{ ...styles.closeButton, color: fg, borderColor: fg }}
        >
          ×
        </button>
        <div style={styles.imageWrap}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={seed ?? fallbackLabel ?? 'Maze'}
              style={styles.image}
              draggable={false}
            />
          ) : (
            <div style={{ ...styles.imagePlaceholder, color: fg }}>
              No image
            </div>
          )}
        </div>
        <div style={{ ...styles.seedRow, color: fg }}>
          {seed ? (
            <span style={styles.seedText}>{seed}</span>
          ) : (
            <span style={styles.unknownText}>
              Seed unknown on this device
              {fallbackLabel ? ` · ${fallbackLabel}` : ''}
            </span>
          )}
        </div>
        {onPlay && seed && (
          <button
            type="button"
            onClick={() => {
              onPlay();
              onClose();
            }}
            style={{
              ...styles.playButton,
              backgroundColor: colors.uiAccentColor,
              color: accentFg,
            }}
          >
            Play this maze
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  panel: {
    position: 'relative',
    maxWidth: 'min(90vw, 720px)',
    maxHeight: '90vh',
    borderRadius: '10px',
    padding: '20px 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
  },
  closeButton: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 32,
    height: 32,
    background: 'transparent',
    border: '1px solid currentColor',
    borderRadius: '6px',
    fontSize: '20px',
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '70vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    imageRendering: 'pixelated',
    display: 'block',
  },
  imagePlaceholder: {
    padding: '60px 20px',
    fontSize: '14px',
    opacity: 0.7,
  },
  seedRow: {
    fontFamily: 'monospace',
    fontSize: '15px',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  seedText: {
    fontFamily: 'monospace',
  },
  unknownText: {
    opacity: 0.7,
    fontSize: '13px',
  },
  playButton: {
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};
