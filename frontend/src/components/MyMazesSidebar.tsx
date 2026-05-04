import { useAccount } from 'wagmi';
import type { ColorScheme } from '../types';
import { useOwnedMazes, type OwnedMaze } from '../hooks/useOwnedMazes';

interface MyMazesSidebarProps {
  isOpen: boolean;
  colors: ColorScheme;
  onSelectSeed: (seed: string) => void;
  onClose: () => void;
}

function shortId(tokenId: bigint): string {
  const hex = tokenId.toString(16).padStart(64, '0');
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function MyMazesSidebar({
  isOpen,
  colors,
  onSelectSeed,
  onClose,
}: MyMazesSidebarProps) {
  const { isConnected, address } = useAccount();
  const { loading, error, mazes } = useOwnedMazes();

  if (!isOpen) return null;

  const bgColor = colors.pathColor;
  const accentColor = colors.uiAccentColor;
  const textColor = colors.wallColor;

  const renderTile = (maze: OwnedMaze) => {
    const replayable = !!maze.seed;
    const onClick = replayable
      ? () => {
          onSelectSeed(maze.seed!);
          onClose();
        }
      : undefined;

    return (
      <button
        key={maze.tokenId.toString()}
        className="my-mazes-tile"
        onClick={onClick}
        disabled={!replayable}
        title={
          replayable
            ? `Replay: ${maze.seed}`
            : 'Seed unknown on this device — solve again to recover.'
        }
        style={{
          ...styles.tile,
          color: textColor,
          cursor: replayable ? 'pointer' : 'default',
          opacity: replayable ? 1 : 0.65,
        }}
      >
        <div style={{ ...styles.thumb, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          {maze.imageUrl ? (
            <img
              src={maze.imageUrl}
              alt={`Maze ${shortId(maze.tokenId)}`}
              style={styles.thumbImg}
              draggable={false}
            />
          ) : (
            <div style={{ ...styles.thumbPlaceholder, color: textColor }}>
              No image
            </div>
          )}
        </div>
        <div style={styles.tileLabel}>
          {maze.seed ? (
            <span style={{ ...styles.seedLabel, color: textColor }}>
              {maze.seed}
            </span>
          ) : (
            <span style={{ ...styles.idLabel, color: textColor }}>
              {shortId(maze.tokenId)}
            </span>
          )}
        </div>
      </button>
    );
  };

  let body: React.ReactNode;
  if (!isConnected) {
    body = (
      <div style={{ ...styles.empty, color: textColor }}>
        Connect a wallet to see the mazes you've minted.
      </div>
    );
  } else if (loading) {
    body = (
      <div style={{ ...styles.empty, color: textColor }}>
        Loading your mazes…
      </div>
    );
  } else if (error) {
    body = <div style={{ ...styles.empty, color: textColor }}>{error}</div>;
  } else if (mazes.length === 0) {
    body = (
      <div style={{ ...styles.empty, color: textColor }}>
        No minted mazes yet for {address?.slice(0, 6)}…{address?.slice(-4)}.
      </div>
    );
  } else {
    body = <div style={styles.grid}>{mazes.map(renderTile)}</div>;
  }

  return (
    <>
      <style>
        {`
          @keyframes mazesSidebarSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes mazesOverlayFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .my-mazes-tile {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            border-radius: 8px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            text-align: left;
            font-family: inherit;
            transition: background-color 0.15s ease;
          }
          .my-mazes-tile:not(:disabled):hover {
            background-color: rgba(255, 255, 255, 0.16);
          }
          .my-mazes-tile:disabled {
            cursor: default;
          }
        `}
      </style>

      <div
        style={{ ...styles.overlay, backgroundColor: colors.modalOverlayColor }}
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
          <h3 style={{ ...styles.title, color: textColor }}>My Mazes</h3>
          <button
            onClick={onClose}
            style={{ ...styles.closeButton, color: textColor }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={styles.body}>{body}</div>
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
    animation: 'mazesOverlayFadeIn 0.2s ease-out',
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '340px',
    maxWidth: '90vw',
    borderLeft: '3px solid',
    zIndex: 1001,
    animation: 'mazesSidebarSlideIn 0.2s ease-out',
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
    padding: 0,
    lineHeight: 1,
    opacity: 0.7,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  },
  tile: {
    width: '100%',
  },
  thumb: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: '6px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  thumbPlaceholder: {
    fontSize: '12px',
    opacity: 0.6,
  },
  tileLabel: {
    minHeight: '18px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  seedLabel: {
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  idLabel: {
    fontSize: '11px',
    opacity: 0.7,
    fontFamily: 'monospace',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    opacity: 0.7,
    fontSize: '14px',
  },
};
