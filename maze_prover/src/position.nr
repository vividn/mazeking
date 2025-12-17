use crate::types::{Position, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT};

// Calculate next position with toroidal wrapping
pub fn next_position(pos: Position, direction: u8, width: u16, height: u16) -> Position {
    let mut new_x = pos.x;
    let mut new_y = pos.y;

    if direction == DIR_UP {
        // y - 1 with wrap
        if pos.y == 0 {
            new_y = height - 1;
        } else {
            new_y = pos.y - 1;
        }
    } else if direction == DIR_RIGHT {
        // x + 1 with wrap
        if pos.x == width - 1 {
            new_x = 0;
        } else {
            new_x = pos.x + 1;
        }
    } else if direction == DIR_DOWN {
        // y + 1 with wrap
        if pos.y == height - 1 {
            new_y = 0;
        } else {
            new_y = pos.y + 1;
        }
    } else if direction == DIR_LEFT {
        // x - 1 with wrap
        if pos.x == 0 {
            new_x = width - 1;
        } else {
            new_x = pos.x - 1;
        }
    }

    Position { x: new_x, y: new_y }
}

// Convert 2D position to 1D array index (row-major order)
pub fn cell_index(pos: Position, width: u16) -> u32 {
    (pos.y as u32) * (width as u32) + (pos.x as u32)
}

// Get the cell index for wall checking given current position and direction
// Returns the index of the cell whose wall we need to check
pub fn wall_check_index(pos: Position, direction: u8, width: u16, height: u16) -> u32 {
    // UP: check southWall of cell above (wrapped)
    // DOWN: check southWall of current cell
    // LEFT: check eastWall of cell to left (wrapped)
    // RIGHT: check eastWall of current cell

    if direction == DIR_UP {
        // Cell above's south wall
        let above_y = if pos.y == 0 { height - 1 } else { pos.y - 1 };
        cell_index(Position { x: pos.x, y: above_y }, width)
    } else if direction == DIR_DOWN {
        // Current cell's south wall
        cell_index(pos, width)
    } else if direction == DIR_LEFT {
        // Cell to left's east wall
        let left_x = if pos.x == 0 { width - 1 } else { pos.x - 1 };
        cell_index(Position { x: left_x, y: pos.y }, width)
    } else {
        // DIR_RIGHT: current cell's east wall
        cell_index(pos, width)
    }
}

// Unit tests for position module
#[test]
fn test_cell_index() {
    // 10x10 grid, (3, 2) should be index 23
    let pos = Position { x: 3, y: 2 };
    assert(cell_index(pos, 10) == 23);
}

#[test]
fn test_cell_index_origin() {
    let pos = Position { x: 0, y: 0 };
    assert(cell_index(pos, 10) == 0);
}

#[test]
fn test_cell_index_last() {
    // 10x10 grid, (9, 9) should be index 99
    let pos = Position { x: 9, y: 9 };
    assert(cell_index(pos, 10) == 99);
}

#[test]
fn test_move_up_normal() {
    let pos = Position { x: 5, y: 5 };
    let next = next_position(pos, DIR_UP, 10, 10);
    assert(next.x == 5);
    assert(next.y == 4);
}

#[test]
fn test_move_up_wrap() {
    let pos = Position { x: 5, y: 0 };
    let next = next_position(pos, DIR_UP, 10, 10);
    assert(next.x == 5);
    assert(next.y == 9);
}

#[test]
fn test_move_down_normal() {
    let pos = Position { x: 5, y: 5 };
    let next = next_position(pos, DIR_DOWN, 10, 10);
    assert(next.x == 5);
    assert(next.y == 6);
}

#[test]
fn test_move_down_wrap() {
    let pos = Position { x: 5, y: 9 };
    let next = next_position(pos, DIR_DOWN, 10, 10);
    assert(next.x == 5);
    assert(next.y == 0);
}

#[test]
fn test_move_left_normal() {
    let pos = Position { x: 5, y: 5 };
    let next = next_position(pos, DIR_LEFT, 10, 10);
    assert(next.x == 4);
    assert(next.y == 5);
}

#[test]
fn test_move_left_wrap() {
    let pos = Position { x: 0, y: 5 };
    let next = next_position(pos, DIR_LEFT, 10, 10);
    assert(next.x == 9);
    assert(next.y == 5);
}

#[test]
fn test_move_right_normal() {
    let pos = Position { x: 5, y: 5 };
    let next = next_position(pos, DIR_RIGHT, 10, 10);
    assert(next.x == 6);
    assert(next.y == 5);
}

#[test]
fn test_move_right_wrap() {
    let pos = Position { x: 9, y: 5 };
    let next = next_position(pos, DIR_RIGHT, 10, 10);
    assert(next.x == 0);
    assert(next.y == 5);
}

#[test]
fn test_wall_check_index_up() {
    // At (5, 5), checking UP means checking cell (5, 4)'s south wall
    let pos = Position { x: 5, y: 5 };
    let idx = wall_check_index(pos, DIR_UP, 10, 10);
    assert(idx == 45); // (5, 4) = 4*10 + 5 = 45
}

#[test]
fn test_wall_check_index_up_wrap() {
    // At (5, 0), checking UP means checking cell (5, 9)'s south wall
    let pos = Position { x: 5, y: 0 };
    let idx = wall_check_index(pos, DIR_UP, 10, 10);
    assert(idx == 95); // (5, 9) = 9*10 + 5 = 95
}

#[test]
fn test_wall_check_index_down() {
    // At (5, 5), checking DOWN means checking current cell's south wall
    let pos = Position { x: 5, y: 5 };
    let idx = wall_check_index(pos, DIR_DOWN, 10, 10);
    assert(idx == 55); // (5, 5) = 5*10 + 5 = 55
}

#[test]
fn test_wall_check_index_left() {
    // At (5, 5), checking LEFT means checking cell (4, 5)'s east wall
    let pos = Position { x: 5, y: 5 };
    let idx = wall_check_index(pos, DIR_LEFT, 10, 10);
    assert(idx == 54); // (4, 5) = 5*10 + 4 = 54
}

#[test]
fn test_wall_check_index_left_wrap() {
    // At (0, 5), checking LEFT means checking cell (9, 5)'s east wall
    let pos = Position { x: 0, y: 5 };
    let idx = wall_check_index(pos, DIR_LEFT, 10, 10);
    assert(idx == 59); // (9, 5) = 5*10 + 9 = 59
}

#[test]
fn test_wall_check_index_right() {
    // At (5, 5), checking RIGHT means checking current cell's east wall
    let pos = Position { x: 5, y: 5 };
    let idx = wall_check_index(pos, DIR_RIGHT, 10, 10);
    assert(idx == 55); // (5, 5) = 5*10 + 5 = 55
}
