// Direction constants matching TypeScript Move enum
pub global DIR_UP: u8 = 0;
pub global DIR_RIGHT: u8 = 1;
pub global DIR_DOWN: u8 = 2;
pub global DIR_LEFT: u8 = 3;

// Cell type constants matching TypeScript CellType enum
pub global CELL_NORMAL: u8 = 0;
pub global CELL_TEXT: u8 = 1;
pub global CELL_ZK_TEXT: u8 = 2;
pub global CELL_CROWN: u8 = 3;

// Position in the maze grid
pub struct Position {
    pub x: u16,
    pub y: u16,
}

impl Position {
    pub fn new(x: u16, y: u16) -> Self {
        Position { x, y }
    }

    pub fn equals(self, other: Position) -> bool {
        (self.x == other.x) & (self.y == other.y)
    }
}

// Encoded cell data (4 bits)
// bit 3: southWall
// bit 2: eastWall
// bits 1-0: cellType
pub struct Cell {
    pub data: u8, // Only lower 4 bits used
}

impl Cell {
    pub fn new(data: u8) -> Self {
        Cell { data: data & 0x0F } // Mask to 4 bits
    }

    pub fn from_parts(south_wall: bool, east_wall: bool, cell_type: u8) -> Self {
        let mut data: u8 = 0;
        if south_wall {
            data = data | 0x08; // bit 3
        }
        if east_wall {
            data = data | 0x04; // bit 2
        }
        data = data | (cell_type & 0x03); // bits 1-0
        Cell { data }
    }

    pub fn has_south_wall(self) -> bool {
        (self.data & 0x08) != 0
    }

    pub fn has_east_wall(self) -> bool {
        (self.data & 0x04) != 0
    }

    pub fn cell_type(self) -> u8 {
        self.data & 0x03
    }

    pub fn is_text_cell(self) -> bool {
        self.cell_type() != CELL_NORMAL
    }
}

// Extract cell from packed byte array
// Packing: high nibble = even cell, low nibble = odd cell
pub fn get_cell_from_packed<let N: u32>(packed: [u8; N], cell_index: u32) -> Cell {
    let byte_index = cell_index / 2;
    let is_odd = (cell_index % 2) == 1;
    let byte = packed[byte_index];

    let nibble = if is_odd {
        byte & 0x0F // Low nibble for odd indices
    } else {
        (byte >> 4) & 0x0F // High nibble for even indices
    };

    Cell::new(nibble)
}

// Unit tests for types
#[test]
fn test_position_new() {
    let pos = Position::new(5, 10);
    assert(pos.x == 5);
    assert(pos.y == 10);
}

#[test]
fn test_position_equals() {
    let p1 = Position::new(3, 7);
    let p2 = Position::new(3, 7);
    let p3 = Position::new(3, 8);
    assert(p1.equals(p2));
    assert(!p1.equals(p3));
}

#[test]
fn test_cell_from_parts_no_walls() {
    let cell = Cell::from_parts(false, false, CELL_NORMAL);
    assert(!cell.has_south_wall());
    assert(!cell.has_east_wall());
    assert(cell.cell_type() == CELL_NORMAL);
    assert(!cell.is_text_cell());
}

#[test]
fn test_cell_from_parts_south_wall() {
    let cell = Cell::from_parts(true, false, CELL_NORMAL);
    assert(cell.has_south_wall());
    assert(!cell.has_east_wall());
    assert(cell.data == 0x08); // bit 3
}

#[test]
fn test_cell_from_parts_east_wall() {
    let cell = Cell::from_parts(false, true, CELL_NORMAL);
    assert(!cell.has_south_wall());
    assert(cell.has_east_wall());
    assert(cell.data == 0x04); // bit 2
}

#[test]
fn test_cell_from_parts_both_walls() {
    let cell = Cell::from_parts(true, true, CELL_NORMAL);
    assert(cell.has_south_wall());
    assert(cell.has_east_wall());
    assert(cell.data == 0x0C); // bits 3 and 2
}

#[test]
fn test_cell_text_type() {
    let cell = Cell::from_parts(false, false, CELL_TEXT);
    assert(cell.cell_type() == CELL_TEXT);
    assert(cell.is_text_cell());
}

#[test]
fn test_cell_zk_text_type() {
    let cell = Cell::from_parts(true, true, CELL_ZK_TEXT);
    assert(cell.cell_type() == CELL_ZK_TEXT);
    assert(cell.is_text_cell());
    assert(cell.has_south_wall());
    assert(cell.has_east_wall());
}

#[test]
fn test_cell_crown_type() {
    let cell = Cell::from_parts(false, true, CELL_CROWN);
    assert(cell.cell_type() == CELL_CROWN);
    assert(cell.is_text_cell());
}

#[test]
fn test_cell_raw_data() {
    // Test decoding raw nibble: 0x0D = 1101 = south(1), east(1), type(01)
    let cell = Cell::new(0x0D);
    assert(cell.has_south_wall());
    assert(cell.has_east_wall());
    assert(cell.cell_type() == CELL_TEXT);
}

#[test]
fn test_get_cell_from_packed_even() {
    // Byte 0x8C = high nibble 0x8 (south wall), low nibble 0xC (both walls)
    let packed: [u8; 2] = [0x8C, 0x00];
    let cell0 = get_cell_from_packed(packed, 0); // Should get 0x8
    assert(cell0.has_south_wall());
    assert(!cell0.has_east_wall());
}

#[test]
fn test_get_cell_from_packed_odd() {
    // Byte 0x8C = high nibble 0x8, low nibble 0xC (both walls)
    let packed: [u8; 2] = [0x8C, 0x00];
    let cell1 = get_cell_from_packed(packed, 1); // Should get 0xC
    assert(cell1.has_south_wall());
    assert(cell1.has_east_wall());
}

#[test]
fn test_get_cell_from_packed_second_byte() {
    // Two bytes with known values
    let packed: [u8; 2] = [0x84, 0x40]; // byte 0: cells 0,1; byte 1: cells 2,3
    // Cell 2 = high nibble of byte 1 = 0x4 (east wall only)
    let cell2 = get_cell_from_packed(packed, 2);
    assert(!cell2.has_south_wall());
    assert(cell2.has_east_wall());
    // Cell 3 = low nibble of byte 1 = 0x0 (no walls)
    let cell3 = get_cell_from_packed(packed, 3);
    assert(!cell3.has_south_wall());
    assert(!cell3.has_east_wall());
}
