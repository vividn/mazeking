const STORAGE_KEY = 'parapets-enabled';

export function readParapetsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === null) return true;
    return value !== 'off' && value !== 'false';
  } catch {
    return true;
  }
}

export function writeParapetsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe); the
    // toggle still works for the current session, just doesn't persist.
  }
}

interface ParapetsProps {
  enabled: boolean;
  /** Pixel-block fill colour. Pass `colors.wallColor` from the seed palette. */
  color: string;
}

const MERLON = 10; // px — width and height of one crenellation block
const SIDE_BRICK_WIDTH = 6;
const SIDE_BRICK_HEIGHT = 14;
const SIDE_BRICK_GAP = 2;

export function Parapets({ enabled, color }: ParapetsProps) {
  if (!enabled) return null;

  const topStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: `${MERLON}px`,
    backgroundImage: `repeating-linear-gradient(
      to right,
      ${color} 0,
      ${color} ${MERLON}px,
      transparent ${MERLON}px,
      transparent ${MERLON * 2}px
    )`,
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    zIndex: 4,
  };

  const sideStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: `${MERLON}px`,
    bottom: 0,
    [side]: 0,
    width: `${SIDE_BRICK_WIDTH}px`,
    backgroundImage: `repeating-linear-gradient(
      to bottom,
      ${color} 0,
      ${color} ${SIDE_BRICK_HEIGHT}px,
      transparent ${SIDE_BRICK_HEIGHT}px,
      transparent ${SIDE_BRICK_HEIGHT + SIDE_BRICK_GAP}px
    )`,
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    zIndex: 4,
  });

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .parapets-side { display: none; }
        }
      `}</style>
      <div aria-hidden style={topStyle} />
      <div aria-hidden className="parapets-side" style={sideStyle('left')} />
      <div aria-hidden className="parapets-side" style={sideStyle('right')} />
    </>
  );
}
