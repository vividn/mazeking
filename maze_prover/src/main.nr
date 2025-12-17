mod types;
mod position;
mod walls;

use types::{Position, Cell, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT};
use position::next_position;
use walls::can_move;

// Maximum cells supported (50x50 = 2500 for small mode)
global MAX_CELLS: u32 = 2500;
// Maximum packed bytes (2 cells per byte)
global MAX_PACKED_BYTES: u32 = 1250;
// Maximum moves supported
global MAX_MOVES: u32 = 3000;

// Main proof function
// Verifies that a sequence of moves:
// 1. Never passes through walls
// 2. Passes through the key position
// 3. Ends at the goal position
fn main(
    // Public inputs - maze definition
    width: pub u16,
    height: pub u16,
    start_x: pub u16,
    start_y: pub u16,
    key_x: pub u16,
    key_y: pub u16,
    goal_x: pub u16,
    goal_y: pub u16,
    packed_cells: pub [u8; MAX_PACKED_BYTES],
    move_count: pub u32,

    // Private input - solution path
    moves: [u8; MAX_MOVES],
) {
    // Validate dimensions
    let total_cells = (width as u32) * (height as u32);
    assert(total_cells <= MAX_CELLS);
    assert(move_count <= MAX_MOVES);
    assert(width > 0);
    assert(height > 0);

    // Validate starting position is within bounds
    assert(start_x < width);
    assert(start_y < height);

    // Initialize state
    let mut pos = Position::new(start_x, start_y);
    let mut has_key = false;

    let key_pos = Position::new(key_x, key_y);
    let goal_pos = Position::new(goal_x, goal_y);

    // Check if we start on the key
    if pos.equals(key_pos) {
        has_key = true;
    }

    // Process each move
    for i in 0..MAX_MOVES {
        if i < move_count {
            let direction = moves[i];

            // Validate direction
            assert(direction <= DIR_LEFT);

            // Check wall - movement must be allowed
            assert(can_move(packed_cells, pos, direction, width, height));

            // Update position
            pos = next_position(pos, direction, width, height);

            // Check if we collected the key
            if pos.equals(key_pos) {
                has_key = true;
            }
        }
    }

    // Final assertions
    assert(has_key);           // Must have collected the key
    assert(pos.equals(goal_pos)); // Must end at goal
}

// ============================================================================
// Integration Tests
// ============================================================================

// Helper to pack two 4-bit cells into a byte
fn pack_cells(even: u8, odd: u8) -> u8 {
    ((even & 0x0F) << 4) | (odd & 0x0F)
}

// Simple 4x4 test maze with a clear path
// Path: (0,0) -> Right x3 to (3,0) [key] -> Down x3 to (3,3) -> Left to (2,3) [goal]
fn create_4x4_test_maze() -> [u8; 8] {
    // 16 cells -> 8 packed bytes
    let c0 = Cell::from_parts(false, false, 0).data;  // (0,0) start
    let c1 = Cell::from_parts(true, false, 0).data;   // (1,0) south wall
    let c2 = Cell::from_parts(true, false, 0).data;   // (2,0) south wall
    let c3 = Cell::from_parts(false, true, 0).data;   // (3,0) key - east wall

    let c4 = Cell::from_parts(false, true, 0).data;   // (0,1) east wall
    let c5 = Cell::from_parts(true, true, 0).data;    // (1,1) blocked
    let c6 = Cell::from_parts(true, true, 0).data;    // (2,1) blocked
    let c7 = Cell::from_parts(false, true, 0).data;   // (3,1) east wall

    let c8 = Cell::from_parts(false, true, 0).data;   // (0,2) east wall
    let c9 = Cell::from_parts(true, true, 0).data;    // (1,2) blocked
    let c10 = Cell::from_parts(true, true, 0).data;   // (2,2) blocked
    let c11 = Cell::from_parts(false, true, 0).data;  // (3,2) east wall

    let c12 = Cell::from_parts(true, false, 0).data;  // (0,3) south wall
    let c13 = Cell::from_parts(true, false, 0).data;  // (1,3) south wall
    let c14 = Cell::from_parts(true, false, 0).data;  // (2,3) goal
    let c15 = Cell::from_parts(true, true, 0).data;   // (3,3) both walls

    let mut packed: [u8; 8] = [0; 8];
    packed[0] = pack_cells(c0, c1);
    packed[1] = pack_cells(c2, c3);
    packed[2] = pack_cells(c4, c5);
    packed[3] = pack_cells(c6, c7);
    packed[4] = pack_cells(c8, c9);
    packed[5] = pack_cells(c10, c11);
    packed[6] = pack_cells(c12, c13);
    packed[7] = pack_cells(c14, c15);
    packed
}

#[test]
fn test_valid_4x4_solution() {
    let cells = create_4x4_test_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..8 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_RIGHT;
    moves[1] = DIR_RIGHT;
    moves[2] = DIR_RIGHT; // Now at key (3,0)
    moves[3] = DIR_DOWN;
    moves[4] = DIR_DOWN;
    moves[5] = DIR_DOWN;  // Now at (3,3)
    moves[6] = DIR_LEFT;  // Now at goal (2,3)

    main(
        4, 4,
        0, 0,
        3, 0,
        2, 3,
        padded_cells,
        7,
        moves
    );
}

#[test(should_fail)]
fn test_miss_key() {
    let cells = create_4x4_test_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..8 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_DOWN;
    moves[1] = DIR_DOWN;
    moves[2] = DIR_DOWN;
    moves[3] = DIR_RIGHT;
    moves[4] = DIR_RIGHT;

    main(
        4, 4,
        0, 0,
        3, 0,
        2, 3,
        padded_cells,
        5,
        moves
    );
}

#[test(should_fail)]
fn test_wrong_destination() {
    let cells = create_4x4_test_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..8 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_RIGHT;
    moves[1] = DIR_RIGHT;
    moves[2] = DIR_RIGHT;
    moves[3] = DIR_DOWN;
    moves[4] = DIR_DOWN;

    main(
        4, 4,
        0, 0,
        3, 0,
        2, 3,
        padded_cells,
        5,
        moves
    );
}

#[test(should_fail)]
fn test_through_wall() {
    let cells = create_4x4_test_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..8 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_DOWN;
    moves[1] = DIR_RIGHT;

    main(
        4, 4,
        0, 0,
        3, 0,
        2, 3,
        padded_cells,
        2,
        moves
    );
}

// ============================================================================
// 10x10 Demo Maze
// ============================================================================

// Create a 10x10 maze with a known solution path (packed format)
// 100 cells -> 50 packed bytes
fn create_10x10_demo_maze() -> [u8; 50] {
    // First create unpacked cells
    let mut cells: [u8; 100] = [0; 100];

    // Initialize all cells with both walls (closed)
    for i in 0..100 {
        cells[i] = Cell::from_parts(true, true, 0).data;
    }

    // Create a path by removing walls
    // Path goes: (0,0) -> right to (9,0) -> down to (9,9) -> left to (5,9) (goal)

    // Row 0: open corridor right
    for x in 0..9 {
        cells[x] = Cell::from_parts(true, false, 0).data;
    }
    // (9,0) has east wall (edge), open south for path down
    cells[9] = Cell::from_parts(false, true, 0).data;

    // Column 9: open corridor down
    for y in 1..9 {
        let idx = y * 10 + 9;
        cells[idx] = Cell::from_parts(false, true, 0).data;
    }
    // (9,9) needs to allow going left
    cells[99] = Cell::from_parts(true, true, 0).data;

    // Row 9: open corridor left from (9,9) to (5,9)
    // Remove east walls from cells (4,9) through (8,9)
    for x in 4..9 {
        let idx = 9 * 10 + x;
        cells[idx] = Cell::from_parts(true, false, 0).data;
    }

    // Now pack the cells
    let mut packed: [u8; 50] = [0; 50];
    for i in 0..100 {
        let byte_idx = i / 2;
        let is_odd = (i % 2) == 1;
        if is_odd {
            packed[byte_idx] = packed[byte_idx] | (cells[i] & 0x0F);
        } else {
            packed[byte_idx] = (cells[i] & 0x0F) << 4;
        }
    }
    packed
}

#[test]
fn test_10x10_valid_solution() {
    let cells = create_10x10_demo_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..50 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    let mut idx = 0;

    // Right x9: (0,0) to (9,0) - collect key
    for _ in 0..9 {
        moves[idx] = DIR_RIGHT;
        idx += 1;
    }

    // Down x9: (9,0) to (9,9)
    for _ in 0..9 {
        moves[idx] = DIR_DOWN;
        idx += 1;
    }

    // Left x4: (9,9) to (5,9) - goal
    for _ in 0..4 {
        moves[idx] = DIR_LEFT;
        idx += 1;
    }

    main(
        10, 10,
        0, 0,
        9, 0,
        5, 9,
        padded_cells,
        22,
        moves
    );
}

#[test(should_fail)]
fn test_10x10_skip_key() {
    let cells = create_10x10_demo_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..50 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];

    main(
        10, 10,
        0, 0,
        9, 0,
        5, 9,
        padded_cells,
        0,
        moves
    );
}

#[test(should_fail)]
fn test_10x10_invalid_move() {
    let cells = create_10x10_demo_maze();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..50 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_DOWN; // Should fail - south wall at (0,0)

    main(
        10, 10,
        0, 0,
        9, 0,
        5, 9,
        padded_cells,
        1,
        moves
    );
}

// Test toroidal wrapping in a small open maze
// 9 cells -> 5 packed bytes
fn create_open_3x3() -> [u8; 5] {
    let c = Cell::from_parts(false, false, 0).data; // no walls

    let mut packed: [u8; 5] = [0; 5];
    // Cells 0-8, all open
    packed[0] = pack_cells(c, c); // 0, 1
    packed[1] = pack_cells(c, c); // 2, 3
    packed[2] = pack_cells(c, c); // 4, 5
    packed[3] = pack_cells(c, c); // 6, 7
    packed[4] = pack_cells(c, 0); // 8, padding
    packed
}

#[test]
fn test_wrap_around_solution() {
    let cells = create_open_3x3();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..5 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_LEFT;  // (0,0) -> (2,0) wrap
    moves[1] = DIR_DOWN;  // (2,0) -> (2,1)
    moves[2] = DIR_DOWN;  // (2,1) -> (2,2) = key
    moves[3] = DIR_LEFT;  // (2,2) -> (1,2)
    moves[4] = DIR_UP;    // (1,2) -> (1,1) = goal

    main(
        3, 3,
        0, 0,
        2, 2,
        1, 1,
        padded_cells,
        5,
        moves
    );
}

#[test]
fn test_start_on_key() {
    let cells = create_open_3x3();

    let mut padded_cells: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    for i in 0..5 {
        padded_cells[i] = cells[i];
    }

    let mut moves: [u8; MAX_MOVES] = [0; MAX_MOVES];
    moves[0] = DIR_RIGHT;
    moves[1] = DIR_DOWN;

    main(
        3, 3,
        0, 0,
        0, 0,
        1, 1,
        padded_cells,
        2,
        moves
    );
}
