import { MAX_MAZE_CELLS } from "../App";

interface MazeSizeWarningProps {
  width: number;
  height: number;
}

export function MazeSizeWarning({ width, height }: MazeSizeWarningProps) {
  const nCells = width * height;
  if (nCells <= MAX_MAZE_CELLS) return null;

  return (
    <div style={styles.warning}>
      Warning: Maximum number of maze cells for ZK proving/NFT minting is {MAX_MAZE_CELLS}. Maze size is ({width}x{height} = {nCells}).
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  warning: {
    backgroundColor: '#b45309',
    color: '#fff',
    padding: '8px 16px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 500,
  },
};
