import React, { useState, useRef, useCallback, useEffect } from 'react';

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
            />
            <div />
            <ArrowButton
              label="◀"
              dir="left"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
            />
            <div style={styles.dpadCenter} />
            <ArrowButton
              label="▶"
              dir="right"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
            />
            <div />
            <ArrowButton
              label="▼"
              dir="down"
              onPress={handleMove}
              disabled={disabled}
              bg={arrowBg}
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
            />
            <ActionButton
              label="Restart"
              onPress={() => {
                setExpanded(false);
                onRestart();
              }}
              bg={wallColor}
            />
            <ActionButton
              label="History"
              onPress={() => {
                setExpanded(false);
                onHistory();
              }}
              bg={wallColor}
            />
            <ActionButton
              label={copied ? 'Copied!' : 'Share'}
              onPress={() => {
                onShare();
              }}
              bg={textBackgroundColor}
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
          role="button"
        >
          <div
            style={{ ...styles.handleBar, backgroundColor: `${accentColor}aa` }}
          />
        </div>
        <div style={styles.compactRow}>
          <CompactButton
            label="H"
            sub="◀"
            dir="left"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
          />
          <CompactButton
            label="J"
            sub="▼"
            dir="down"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
          />
          <CompactButton
            label="K"
            sub="▲"
            dir="up"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
          />
          <CompactButton
            label="L"
            sub="▶"
            dir="right"
            onPress={handleMove}
            disabled={disabled}
            bg={arrowBgFaint}
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
}

const ArrowButton: React.FC<ArrowButtonProps> = ({
  label,
  dir,
  onPress,
  disabled,
  bg,
}) => (
  <button
    type="button"
    aria-label={`Move ${dir}`}
    disabled={disabled}
    onClick={() => onPress(dir)}
    style={{
      ...styles.arrowButton,
      backgroundColor: bg,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {label}
  </button>
);

interface CompactButtonProps {
  label: string;
  sub: string;
  dir: Direction;
  onPress: (dir: Direction) => void;
  disabled: boolean;
  bg: string;
}

const CompactButton: React.FC<CompactButtonProps> = ({
  label,
  sub,
  dir,
  onPress,
  disabled,
  bg,
}) => (
  <button
    type="button"
    aria-label={`Move ${dir}`}
    disabled={disabled}
    onClick={() => onPress(dir)}
    style={{
      ...styles.compactButton,
      backgroundColor: bg,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <span style={styles.compactArrow}>{sub}</span>
    <span style={styles.compactLetter}>{label}</span>
  </button>
);

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  bg: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ label, onPress, bg }) => (
  <button
    type="button"
    onClick={onPress}
    style={{ ...styles.actionButton, backgroundColor: bg }}
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
    color: 'white',
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
    minWidth: '90px',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
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
  handleBar: {
    width: '44px',
    height: '4px',
    borderRadius: '2px',
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
    color: 'white',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontWeight: 600,
  },
  compactArrow: {
    fontSize: '14px',
    opacity: 0.8,
  },
  compactLetter: {
    fontSize: '14px',
    fontFamily: 'monospace',
    letterSpacing: '0.5px',
  },
};
