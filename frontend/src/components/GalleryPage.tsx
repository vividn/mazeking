import { useEffect, useMemo, useState } from 'react';
import { useGalleryMazes, type GalleryMaze } from '../hooks/useGalleryMazes';
import { generateColorScheme } from '../lib/colorGenerator';
import { pickTextColor } from '../lib/contrastText';
import { useAppOutlet } from '../App';
import { PageHeader } from './PageHeader';
import { KaztleText } from './KaztleText';

type SortMode = 'solves' | 'minMoves' | 'newest';

function shortId(tokenId: bigint): string {
  const hex = tokenId.toString(16).padStart(64, '0');
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function GalleryPage() {
  const { loading, error, mazes } = useGalleryMazes(true);
  const [sort, setSort] = useState<SortMode>('solves');
  const { seed, selectSeed } = useAppOutlet();
  const colors = useMemo(() => generateColorScheme(seed), [seed]);

  useEffect(() => {
    document.body.style.backgroundColor = colors.pageBackgroundColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.headerBackgroundColor);
  }, [colors]);

  const sorted = useMemo(() => {
    const list = [...mazes];
    if (sort === 'solves') {
      list.sort((a, b) => b.timesSolved - a.timesSolved);
    } else if (sort === 'minMoves') {
      list.sort((a, b) => {
        const am = a.minMoves ?? Number.POSITIVE_INFINITY;
        const bm = b.minMoves ?? Number.POSITIVE_INFINITY;
        return am - bm;
      });
    }
    return list;
  }, [mazes, sort]);

  const accentColor = colors.uiAccentColor;
  const textColor = colors.wallColor;

  const renderTile = (maze: GalleryMaze) => {
    const replayable = !!maze.seed;
    const onClick = replayable ? () => selectSeed(maze.seed!) : undefined;
    const label = maze.seed ?? shortId(maze.tokenId);
    return (
      <button
        key={maze.tokenId.toString()}
        className="gallery-tile"
        onClick={onClick}
        disabled={!replayable}
        title={
          replayable
            ? `Play "${maze.seed}"`
            : 'Seed not published — solve again from this device to recover.'
        }
        style={{
          ...styles.tile,
          color: textColor,
          cursor: replayable ? 'pointer' : 'default',
          opacity: replayable ? 1 : 0.7,
        }}
      >
        <div style={{ ...styles.thumb, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          {maze.imageUrl ? (
            <img
              src={maze.imageUrl}
              alt={`Maze ${label}`}
              style={styles.thumbImg}
              draggable={false}
            />
          ) : (
            <div style={{ ...styles.thumbPlaceholder, color: textColor }}>
              No image
            </div>
          )}
          <div
            style={{
              ...styles.solveBadge,
              backgroundColor: accentColor,
              color: pickTextColor(accentColor),
            }}
            aria-label={`${maze.timesSolved} solves`}
          >
            {maze.timesSolved}×
          </div>
        </div>
        <div style={styles.tileLabel}>
          <span style={{ ...styles.seedLabel, color: textColor }}>{label}</span>
          <span style={{ ...styles.metaLabel, color: textColor }}>
            {maze.minMoves !== null ? `best ${maze.minMoves}` : 'unsolved'}
          </span>
        </div>
      </button>
    );
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div style={{ ...styles.empty, color: textColor }}>Loading gallery…</div>
    );
  } else if (error) {
    body = <div style={{ ...styles.empty, color: textColor }}>{error}</div>;
  } else if (sorted.length === 0) {
    body = (
      <div style={{ ...styles.empty, color: textColor }}>
        No mazes yet. Mint one to start the gallery.
      </div>
    );
  } else {
    body = <div style={styles.grid}>{sorted.map(renderTile)}</div>;
  }

  const sortButton = (mode: SortMode, label: string) => (
    <button
      onClick={() => setSort(mode)}
      style={{
        ...styles.sortButton,
        color: sort === mode ? pickTextColor(accentColor) : textColor,
        backgroundColor:
          sort === mode ? accentColor : 'rgba(255, 255, 255, 0.08)',
        fontWeight: sort === mode ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ ...styles.page, backgroundColor: colors.pageBackgroundColor }}
    >
      <style>
        {`
          .gallery-tile {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            text-align: left;
            font-family: inherit;
            cursor: pointer;
            transition: background-color 0.15s ease;
          }
          .gallery-tile:not(:disabled):hover {
            background-color: rgba(255, 255, 255, 0.16);
          }
          .gallery-tile:disabled {
            cursor: default;
          }
        `}
      </style>
      <PageHeader
        title={
          <>
            Public <KaztleText word="kaztles" colors={colors} />
          </>
        }
        colors={colors}
        current="gallery"
      />
      <div style={styles.sortRow}>
        {sortButton('solves', 'Most solved')}
        {sortButton('minMoves', 'Best score')}
        {sortButton('newest', 'Newest')}
      </div>
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
  sortRow: {
    display: 'flex',
    gap: '8px',
    padding: '10px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexShrink: 0,
  },
  sortButton: {
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
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
    position: 'relative',
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
  solveBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'monospace',
    lineHeight: 1.2,
  },
  tileLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minHeight: '28px',
    overflow: 'hidden',
  },
  seedLabel: {
    fontSize: '13px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metaLabel: {
    fontSize: '11px',
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
