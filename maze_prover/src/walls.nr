use crate::types::{Position, Cell, get_cell_from_packed, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT};
use crate::position::wall_check_index;

// Check if movement is allowed from given position in given direction
// This matches the TypeScript canMove function exactly:
// - UP: check cells[aboveY][x].southWall
// - DOWN: check cells[y][x].southWall
// - LEFT: check cells[y][leftX].eastWall
// - RIGHT: check cells[y][x].eastWall
//
// packed_cells uses 4-bit encoding: 2 cells per byte
pub fn can_move<let N: u32>(
    packed_cells: [u8; N],
    pos: Position,
    direction: u8,
    width: u16,
    height: u16
) -> bool {
    let idx = wall_check_index(pos, direction, width, height);
    let cell = get_cell_from_packed(packed_cells, idx);

    if (direction == DIR_UP) | (direction == DIR_DOWN) {
        // Check south wall
        !cell.has_south_wall()
    } else {
        // DIR_LEFT or DIR_RIGHT: check east wall
        !cell.has_east_wall()
    }
}

// Unit tests for walls module
// We'll create small test mazes to verify wall checking

// Helper to pack two 4-bit cells into a byte
fn pack_cells(even: u8, odd: u8) -> u8 {
    ((even & 0x0F) << 4) | (odd & 0x0F)
}

// Helper to create a simple 3x3 test maze with specific walls
// Layout (walls shown as |, -, . = no wall):
//   0   1   2
// +---+---+---+
// | 0 . 1 | 2 |  y=0
// +   +---+   +
// | 3 | 4 . 5 |  y=1
// +---+   +---+
// | 6 . 7 | 8 |  y=2
// +---+---+---+
// Returns packed array (5 bytes for 9 cells)
fn create_test_maze_3x3() -> [u8; 5] {
    // Cell 0: no south, no east      = 0x00
    // Cell 1: no south, east wall    = 0x04
    // Cell 2: south wall, no east    = 0x08
    // Cell 3: south wall, east wall  = 0x0C
    // Cell 4: no south, no east      = 0x00
    // Cell 5: south wall, no east    = 0x08
    // Cell 6: south wall, no east    = 0x08
    // Cell 7: south wall, east wall  = 0x0C
    // Cell 8: south wall, no east    = 0x08

    let c0 = Cell::from_parts(false, false, 0).data;
    let c1 = Cell::from_parts(false, true, 0).data;
    let c2 = Cell::from_parts(true, false, 0).data;
    let c3 = Cell::from_parts(true, true, 0).data;
    let c4 = Cell::from_parts(false, false, 0).data;
    let c5 = Cell::from_parts(true, false, 0).data;
    let c6 = Cell::from_parts(true, false, 0).data;
    let c7 = Cell::from_parts(true, true, 0).data;
    let c8 = Cell::from_parts(true, false, 0).data;

    let mut packed: [u8; 5] = [0; 5];
    packed[0] = pack_cells(c0, c1); // cells 0, 1
    packed[1] = pack_cells(c2, c3); // cells 2, 3
    packed[2] = pack_cells(c4, c5); // cells 4, 5
    packed[3] = pack_cells(c6, c7); // cells 6, 7
    packed[4] = pack_cells(c8, 0);  // cell 8, padding
    packed
}

#[test]
fn test_can_move_right_open() {
    let cells = create_test_maze_3x3();
    // Cell 0 has no east wall, can move right
    let pos = Position { x: 0, y: 0 };
    assert(can_move(cells, pos, DIR_RIGHT, 3, 3));
}

#[test]
fn test_can_move_right_blocked() {
    let cells = create_test_maze_3x3();
    // Cell 1 has east wall, cannot move right
    let pos = Position { x: 1, y: 0 };
    assert(!can_move(cells, pos, DIR_RIGHT, 3, 3));
}

#[test]
fn test_can_move_down_open() {
    let cells = create_test_maze_3x3();
    // Cell 0 has no south wall, can move down
    let pos = Position { x: 0, y: 0 };
    assert(can_move(cells, pos, DIR_DOWN, 3, 3));
}

#[test]
fn test_can_move_down_blocked() {
    let cells = create_test_maze_3x3();
    // Cell 2 has south wall, cannot move down
    let pos = Position { x: 2, y: 0 };
    assert(!can_move(cells, pos, DIR_DOWN, 3, 3));
}

#[test]
fn test_can_move_left_open() {
    let cells = create_test_maze_3x3();
    // Moving left from (1,0) checks cell 0's east wall (no wall)
    let pos = Position { x: 1, y: 0 };
    assert(can_move(cells, pos, DIR_LEFT, 3, 3));
}

#[test]
fn test_can_move_left_blocked() {
    let cells = create_test_maze_3x3();
    // Moving left from (2,0) checks cell 1's east wall (has wall)
    let pos = Position { x: 2, y: 0 };
    assert(!can_move(cells, pos, DIR_LEFT, 3, 3));
}

#[test]
fn test_can_move_up_open() {
    let cells = create_test_maze_3x3();
    // Moving up from (0,1) checks cell (0,0)'s south wall (no wall)
    let pos = Position { x: 0, y: 1 };
    assert(can_move(cells, pos, DIR_UP, 3, 3));
}

#[test]
fn test_can_move_up_blocked() {
    let cells = create_test_maze_3x3();
    // Moving up from (0,2) checks cell (0,1)'s south wall (cell 3 has wall)
    let pos = Position { x: 0, y: 2 };
    assert(!can_move(cells, pos, DIR_UP, 3, 3));
}

// Test wrapping moves
#[test]
fn test_can_move_right_wrap() {
    let cells = create_test_maze_3x3();
    // Moving right from (2,0) wraps to (0,0), checks cell 2's east wall
    // Cell 2 has no east wall
    let pos = Position { x: 2, y: 0 };
    assert(can_move(cells, pos, DIR_RIGHT, 3, 3));
}

#[test]
fn test_can_move_left_wrap() {
    let cells = create_test_maze_3x3();
    // Moving left from (0,0) wraps, checks cell (2,0)'s east wall
    // Cell 2 has no east wall
    let pos = Position { x: 0, y: 0 };
    assert(can_move(cells, pos, DIR_LEFT, 3, 3));
}

#[test]
fn test_can_move_down_wrap() {
    let cells = create_test_maze_3x3();
    // Moving down from (0,2) wraps to (0,0), checks cell (0,2)'s south wall
    // Cell 6 has south wall, blocked
    let pos = Position { x: 0, y: 2 };
    assert(!can_move(cells, pos, DIR_DOWN, 3, 3));
}

#[test]
fn test_can_move_up_wrap() {
    let cells = create_test_maze_3x3();
    // Moving up from (0,0) wraps, checks cell (0,2)'s south wall
    // Cell 6 has south wall, blocked
    let pos = Position { x: 0, y: 0 };
    assert(!can_move(cells, pos, DIR_UP, 3, 3));
}

// Create a simple corridor for path testing
// 4x1 horizontal corridor: all cells connected horizontally
// Returns packed array (2 bytes for 4 cells)
fn create_corridor_4x1() -> [u8; 2] {
    // All cells have south wall (0x08), no east wall
    let c = Cell::from_parts(true, false, 0).data; // 0x08

    let mut packed: [u8; 2] = [0; 2];
    packed[0] = pack_cells(c, c); // cells 0, 1
    packed[1] = pack_cells(c, c); // cells 2, 3
    packed
}

#[test]
fn test_corridor_move_right() {
    let cells = create_corridor_4x1();
    // Can move right through all cells
    let pos0 = Position { x: 0, y: 0 };
    let pos1 = Position { x: 1, y: 0 };
    let pos2 = Position { x: 2, y: 0 };
    let pos3 = Position { x: 3, y: 0 };

    assert(can_move(cells, pos0, DIR_RIGHT, 4, 1));
    assert(can_move(cells, pos1, DIR_RIGHT, 4, 1));
    assert(can_move(cells, pos2, DIR_RIGHT, 4, 1));
    assert(can_move(cells, pos3, DIR_RIGHT, 4, 1)); // wraps to 0
}

#[test]
fn test_corridor_blocked_down() {
    let cells = create_corridor_4x1();
    // Cannot move down (south walls everywhere, 1 row maze)
    let pos = Position { x: 0, y: 0 };
    assert(!can_move(cells, pos, DIR_DOWN, 4, 1));
}
