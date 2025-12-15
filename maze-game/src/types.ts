/**
 * Type definitions for the toroidal maze game.
 *
 * The maze is a toroidal (wrapping) grid where the player (king) must:
 * 1. Collect the key
 * 2. Reach the goal to win
 *
 * Move history is tracked for future zero-knowledge proof generation.
 */

/**
 * Represents a single cell in the maze.
 * Uses bit flags for compact storage:
 * - bit 0: South wall present
 * - bit 1: East wall present
 * - bit 2: Cell is part of embedded text
 */
export interface Cell {
  /** True if there is a wall on the south side of this cell */
  southWall: boolean;

  /** True if there is a wall on the east side of this cell */
  eastWall: boolean;

  /** True if this cell is part of embedded text in the maze */
  isTextCell: boolean;

  /** True if this cell is part of a Z or K letter (zero-knowledge highlight) */
  isZkCell: boolean;
}

/**
 * 2D coordinate position in the maze grid.
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Complete maze structure with all cells and dimensions.
 */
export interface MazeData {
  /** Width of the maze (number of columns) */
  width: number;

  /** Height of the maze (number of rows) */
  height: number;

  /** 2D array of cells [y][x] - row-major order */
  cells: Cell[][];
}

/**
 * Move direction encoded as 2-bit values (0-3) for compact ZK proof.
 */
export enum Move {
  Up = 0,
  Right = 1,
  Down = 2,
  Left = 3
}

/**
 * Complete game state tracking all gameplay progress.
 */
export interface GameState {
  /** Current position of the player (king) */
  playerPos: Position;

  /** Position of the key to collect */
  keyPos: Position;

  /** Position of the goal (win condition) */
  goalPos: Position;

  /** True if the player has collected the key */
  hasKey: boolean;

  /** Total number of moves made */
  moveCount: number;

  /** Array of all moves made (for ZK proof) */
  moves: Move[];

  /** True if the player has won (collected key and reached goal) */
  gameWon: boolean;
}

/**
 * Serialized maze data for ZK proof generation.
 * Contains all information needed to verify a winning path.
 */
export interface SerializedMaze {
  /** The maze structure */
  maze: MazeData;

  /** Initial player position at game start */
  startPlayerPos: Position;

  /** Key position */
  startKeyPos: Position;

  /** Goal position */
  startGoalPos: Position;
}

/**
 * Color scheme for rendering the maze and game elements.
 * All colors should be in CSS-compatible format (hex, rgb, etc.).
 */
export interface ColorScheme {
  /** Color for standard maze walls */
  wallColor: string;

  /** Color for walkable paths */
  pathColor: string;

  /** Background color for non-text maze areas */
  mazeBackgroundColor: string;

  /** Color for visited squares */
  visitedColor: string;

  /** Color for walls that form embedded text */
  textWallColor: string;

  /** Background color for text cell areas */
  textBackgroundColor: string;

  /** Color for visited text cells */
  textVisitedColor: string;

  /** Background color for Z/K letters (zero-knowledge highlight) */
  zkBackgroundColor: string;

  /** Visited color for Z/K letters */
  zkVisitedColor: string;

  /** Color for the player (king) sprite/indicator */
  playerColor: string;

  /** Color for the key sprite/indicator */
  keyColor: string;

  /** Color for the goal sprite/indicator */
  goalColor: string;

  /** Accent color for UI elements */
  uiAccentColor: string;

  /** Glow color for player highlight */
  playerGlowColor: string;

  /** Glow color for key highlight */
  keyGlowColor: string;

  /** Glow color for goal highlight */
  goalGlowColor: string;
}
