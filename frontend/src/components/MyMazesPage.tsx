import { useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useOwnedMazes, type OwnedMaze } from '../hooks/useOwnedMazes';
import { generateColorScheme } from '../lib/colorGenerator';
import { useAppOutlet } from '../App';
import { PageHeader } from './PageHeader';
import { KaztleText } from './KaztleText';

function shortId(tokenId: bigint): string {
  const hex = tokenId.toString(16).padStart(64, '0');
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function MyMazesPage() {
  const { isConnected, address } = useAccount();
  const { loading, error, mazes } = useOwnedMazes(true);
  const { seed, selectSeed } = useAppOutlet();
  const colors = useMemo(() => generateColorScheme(seed), [seed]);

  useEffect(() => {
    document.body.style.backgroundColor = colors.pageBackgroundColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.headerBackgroundColor);
  }, [colors]);

  const textColor = colors.wallColor;

  const renderTile = (maze: OwnedMaze) => {
    const replayable = !!maze.seed;
    const onClick = replayable ? () => selectSeed(maze.seed!) : undefined;

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
    <div
      style={{ ...styles.page, backgroundColor: colors.pageBackgroundColor }}
    >
      <style>
        {`
          .my-mazes-tile {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
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
      <PageHeader
        title={
          <>
            Your <KaztleText word="kaztles" colors={colors} />
          </>
        }
        colors={colors}
        current="mazes"
      />
      <div style={styles.body}>{body}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px 40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '14px',
    maxWidth: '1400px',
    margin: '0 auto',
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
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  idLabel: {
    fontSize: '12px',
    opacity: 0.7,
    fontFamily: 'monospace',
  },
  empty: {
    padding: '40px 20px',
    textAlign: 'center',
    opacity: 0.7,
    fontSize: '14px',
  },
};
