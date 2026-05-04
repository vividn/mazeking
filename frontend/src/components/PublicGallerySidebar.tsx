import { useMemo, useState } from 'react';
import type { ColorScheme } from '../types';
import { useGalleryMazes, type GalleryMaze } from '../hooks/useGalleryMazes';

type SortMode = 'solves' | 'minMoves' | 'newest';

interface PublicGallerySidebarProps {
  isOpen: boolean;
  colors: ColorScheme;
  onSelectSeed: (seed: string) => void;
  onClose: () => void;
}

export function PublicGallerySidebar({
  isOpen,
  colors,
  onSelectSeed,
  onClose,
}: PublicGallerySidebarProps) {
  const { loading, error, mazes } = useGalleryMazes(isOpen);
  const [sort, setSort] = useState<SortMode>('solves');

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
    // 'newest' preserves the registration scan order (newest blocks first
    // are returned by the underlying scan because we walk from head down,
    // but the Map preserves first-insert order — so 'newest' here is
    // effectively the natural order from the contract).
    return list;
  }, [mazes, sort]);

  if (!isOpen) return null;

  const bgColor = colors.pathColor;
  const accentColor = colors.uiAccentColor;
  const textColor = colors.wallColor;

  const renderTile = (maze: GalleryMaze) => {
    const onClick = () => {
      onSelectSeed(maze.seed);
      onClose();
    };
    return (
      <button
        key={maze.tokenId.toString()}
        className="gallery-tile"
        onClick={onClick}
        title={`Play "${maze.seed}"`}
        style={{ ...styles.tile, color: textColor }}
      >
        <div style={{ ...styles.thumb, backgroundColor: 'rgba(0,0,0,0.25)' }}>
          {maze.imageUrl ? (
            <img
              src={maze.imageUrl}
              alt={`Maze ${maze.seed}`}
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
              color: textColor,
            }}
            aria-label={`${maze.timesSolved} solves`}
          >
            {maze.timesSolved}×
          </div>
        </div>
        <div style={styles.tileLabel}>
          <span style={{ ...styles.seedLabel, color: textColor }}>
            {maze.seed}
          </span>
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
        No registered mazes yet. Mint one to start the gallery.
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
        color: textColor,
        backgroundColor:
          sort === mode ? accentColor : 'rgba(255, 255, 255, 0.08)',
        fontWeight: sort === mode ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <style>
        {`
          @keyframes gallerySidebarSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes galleryOverlayFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .gallery-tile {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            border-radius: 8px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            text-align: left;
            font-family: inherit;
            cursor: pointer;
            transition: background-color 0.15s ease;
          }
          .gallery-tile:hover {
            background-color: rgba(255, 255, 255, 0.16);
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
          <h3 style={{ ...styles.title, color: textColor }}>Public Gallery</h3>
          <button
            onClick={onClose}
            style={{ ...styles.closeButton, color: textColor }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={styles.sortRow}>
          {sortButton('solves', 'Most solved')}
          {sortButton('minMoves', 'Best score')}
          {sortButton('newest', 'Newest')}
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
    animation: 'galleryOverlayFadeIn 0.2s ease-out',
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '360px',
    maxWidth: '92vw',
    borderLeft: '3px solid',
    zIndex: 1001,
    animation: 'gallerySidebarSlideIn 0.2s ease-out',
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
  sortRow: {
    display: 'flex',
    gap: '6px',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  sortButton: {
    flex: 1,
    border: 'none',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    cursor: 'pointer',
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
    fontSize: '12px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metaLabel: {
    fontSize: '10px',
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
