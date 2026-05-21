// Maze is the public entry point for the maze rendering pipeline. The actual
// implementation lives split across two seams:
//   - MazeCanvas: pure canvas painter (cells, sprites, overlays)
//   - MazeViewport: gesture + transform state + forwardRef
// Callers (Game, WinModal, HeaderSeedInput) import `Maze` here.
export { MazeViewport as Maze } from './MazeViewport';
export type { MazeHandle, MazeProps } from './MazeViewport';
