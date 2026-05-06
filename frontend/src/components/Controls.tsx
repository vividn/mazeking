import React, { useState, useRef, useCallback, useEffect } from 'react';
import { pickTextColor } from '../lib/contrastText';

interface ControlsProps {
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onNewGame: () => void;
  onHistory: () => void;
  onShare: () => void;
  onRestart: () => void;
  disabled?: boolean;
  accentColor: string;
  wallColor: string;
  textBackgroundColor: string;
  copied: boolean;
}

type Direction = 'up' | 'down' | 'left' | 'right';

const SWIPE_THRESHOLD = 30;
const TAP_MAX_DURATION = 250;

export const Controls: React.FC<ControlsProps> = ({
  onMove,
  onNewGame,
  onHistory,
  onShare,
  onRestart,
  disabled = false,
  accentColor,
  wallColor,
  textBackgroundColor,
  copied,
}) => {
  const [expanded, setExpanded] = useState(false);
  const touchStartRef = useRef<{ y: number; t: number } | null>(null);

  const handleMove = useCallback(
    (dir: Direction) => {
      if (!disabled) onMove(dir);
    },
    [disabled, onMove]
  );

  // Swipe-up on the compact row expands; swipe-down collapses
  const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { y: e.touches[0].clientY, t: Date.now() };
  }, []);

  const handleHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const dy = start.y - e.changedTouches[0].clientY;
    const dt = Date.now() - start.t;
    if (dy > SWIPE_THRESHOLD) {
      setExpanded(true);
    } else if (dy < -SWIPE_THRESHOLD) {
      setExpanded(false);
    } else if (dt < TAP_MAX_DURATION && Math.abs(dy) < 8) {
      setExpanded((v) => !v);
    }
    touchStartRef.current = null;
  }, []);

  // Collapse expanded panel on outside tap
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-controls-root]')) return;
      setExpanded(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [expanded]);

  const arrowBg = disabled ? 'rgba(128,128,128,0.25)' : `${accentColor}cc`;
  const arrowBgFaint = disabled ? 'rgba(128,128,128,0.15)' : `${accentColor}88`;
  // Pick contrast based on the underlying hue (alpha is stripped).
  const arrowFg = pickTextColor(accentColor);
  const accentFg = pickTextColor(accentColor);
  const wallFg = pickTextColor(wallColor);
  const textBgFg = pickTextColor(textBackgroundColor);

  return (
    <div data-controls-root style={styles.root}>
      {/* Expanded panel: full d-pad + action buttons */}
      <div
        style={{
          ...styles.expandedPanel,
          maxHeight: expanded ? '320px' : '0px',
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
        }}
      >
        <div style={styles.expandedInner}>
          <div style={styles.dpad}>
            <div />
            <ArrowButton
              label="▲"
              dir="up"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
              fg={arrowFg}
            />
            <div />
            <ArrowButton
              label="◀"
              dir="left"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
              fg={arrowFg}
            />
            <div style={styles.dpadCenter} />
            <ArrowButton
              label="▶"
              dir="right"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
              fg={arrowFg}
            />
            <div />
            <ArrowButton
              label="▼"
              dir="down"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
              fg={arrowFg}
            />
            <div />
          </div>
          <div style={styles.actionGroup}>
            <ActionButton
              label="New Maze"
              onPress={() => {
                setExpanded(false);
                onNewGame();
              }}
              bg={accentColor}
              fg={accentFg}
            />
            <ActionButton
              label="Restart"
              onPress={() => {
                setExpanded(false);
                onRestart();
              }}
              bg={wallColor}
              fg={wallFg}
            />
            <ActionButton
              label="History"
              onPress={() => {
                setExpanded(false);
                onHistory();
              }}
              bg={wallColor}
              fg={wallFg}
            />
            <ActionButton
              label={copied ? 'Copied!' : 'Share'}
              onPress={() => {
                onShare();
              }}
              bg={textBackgroundColor}
              fg={textBgFg}
            />
          </div>
        </div>
      </div>

      {/* Compact bottom bar: vim-style h j k l row + handle */}
      <div style={styles.compactBar}>
        <div
          style={styles.handle}
          onTouchStart={handleHandleTouchStart}
          onTouchEnd={handleHandleTouchEnd}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse controls' : 'Expand controls'}
          aria-expanded={expanded}
          role="button"
        >
          <div
            style={{
              ...styles.handlePill,
              backgroundColor: `${accentColor}cc`,
              color: arrowFg,
            }}
          >
            <span style={styles.handleChevron} aria-hidden>
              {expanded ? '▼' : '▲'}
            </span>
            <span style={styles.handleLabel}>
              {expanded ? 'Hide menu' : 'Menu'}
            </span>
          </div>
        </div>
        <div style={styles.compactRow}>
          <CompactButton
            arrow="◀"
            dir="left"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
            fg={arrowFg}
          />
          <CompactButton
            arrow="▼"
            dir="down"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
            fg={arrowFg}
          />
          <CompactButton
            arrow="▲"
            dir="up"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
            fg={arrowFg}
          />
          <CompactButton
            arrow="▶"
            dir="right"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
            fg={arrowFg}
          />
        </div>
      </div>
    </div>
  );
};

interface ArrowButtonProps {
  label: string;
  dir: Direction;
  onPress: (dir: Direction) => void;
  disabled: boolean;
  bg: string;
  fg: string;
}

const ArrowButton: React.FC<ArrowButtonProps> = ({
  label,
  dir,
  onPress,
  disabled,
  bg,
  fg,
}) => (
  <button
    type="button"
    aria-label={`Move ${dir}`}
    disabled={disabled}
    onClick={() => onPress(dir)}
    style={{
      ...styles.arrowButton,
      backgroundColor: bg,
      color: fg,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {label}
  </button>
);

interface CompactButtonProps {
  arrow: string;
  dir: Direction;
  onPress: (dir: Direction) => void;
  disabled: boolean;
  bg: string;
  fg: string;
}

const CompactButton: React.FC<CompactButtonProps> = ({
  arrow,
  dir,
  onPress,
  disabled,
  bg,
  fg,
}) => (
  <button
    type="button"
    aria-label={`Move ${dir}`}
    disabled={disabled}
    onClick={() => onPress(dir)}
    style={{
      ...styles.compactButton,
      backgroundColor: bg,
      color: fg,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <span style={styles.compactArrow}>{arrow}</span>
  </button>
);

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  bg: string;
  fg: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  onPress,
  bg,
  fg,
}) => (
  <button
    type="button"
    onClick={onPress}
    style={{
      ...styles.actionButton,
      backgroundColor: bg,
      color: fg,
      // Dark text shadow muddies black text on light bg; only keep when text is white.
      textShadow: fg === '#fff' ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
    }}
  >
    {label}
  </button>
);

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  },
  expandedPanel: {
    pointerEvents: 'auto',
    overflow: 'hidden',
    transition: 'max-height 0.22s ease, opacity 0.18s ease',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  },
  expandedInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 16px',
    alignItems: 'center',
  },
  dpad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 56px)',
    gridTemplateRows: 'repeat(3, 56px)',
    gap: '6px',
  },
  dpadCenter: {
    width: '56px',
    height: '56px',
  },
  arrowButton: {
    width: '56px',
    height: '56px',
    border: 'none',
    borderRadius: '12px',
    fontSize: '22px',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  },
  actionGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flex: '1 1 auto',
    minWidth: '96px',
    padding: '12px 16px',
    fontSize: '16px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    minHeight: '44px',
  },
  compactBar: {
    pointerEvents: 'auto',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    paddingBottom: '6px',
  },
  handle: {
    display: 'flex',
    justifyContent: 'center',
    padding: '6px 0 4px 0',
    cursor: 'pointer',
    touchAction: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  handlePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 14px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    minHeight: '24px',
  },
  handleChevron: {
    fontSize: '11px',
    lineHeight: 1,
  },
  handleLabel: {
    lineHeight: 1,
    textTransform: 'uppercase',
  },
  compactRow: {
    display: 'flex',
    gap: '6px',
    padding: '0 8px 6px 8px',
    justifyContent: 'space-between',
  },
  compactButton: {
    flex: 1,
    height: '40px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
  },
  compactArrow: {
    fontSize: '22px',
    lineHeight: 1,
  },
};
