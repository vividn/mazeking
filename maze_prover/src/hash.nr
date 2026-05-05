// Maze layout hash (Pedersen, BN254).
//
// Cross-layer canonical bytes for a maze layout (1520 bytes):
//   bytes[ 0.. 2] = width  (big-endian u16)
//   bytes[ 2.. 4] = height (big-endian u16)
//   bytes[ 4.. 6] = start_x
//   bytes[ 6.. 8] = start_y
//   bytes[ 8..10] = robe_x
//   bytes[10..12] = robe_y
//   bytes[12..14] = scepter_x
//   bytes[14..16] = scepter_y
//   bytes[16..18] = goal_x
//   bytes[18..20] = goal_y
//   bytes[20..1520] = packed_cells (padded to MAX_PACKED_BYTES with zeros)
//
// We pack bytes into BN254 field elements at 31 bytes per field,
// big-endian within each chunk. 1520 / 31 = 49 remainder 1, so we
// emit 50 fields total. The last field is left-padded with zeros for
// bytes that fall past the end of the layout.
//
// The hash is `std::hash::pedersen_hash(fields)` (hash_index = 0).
// The TS frontend can compute the matching hash via `bb.js`'s
// `pedersenHash(fields, 0)`; the Solidity contract trusts the
// caller-supplied hash because the proof binds it to the layout.

use std::hash::pedersen_hash;

pub global LAYOUT_HEADER_BYTES: u32 = 20; // 10 u16s, big-endian
pub global PEDERSEN_FIELD_BYTES: u32 = 31;
pub global MAX_PACKED_BYTES: u32 = 1500;
pub global LAYOUT_TOTAL_BYTES: u32 = LAYOUT_HEADER_BYTES + MAX_PACKED_BYTES; // 1520
pub global LAYOUT_FIELD_COUNT: u32 = 50; // ceil(1520/31)

/// Pack a 31-byte big-endian chunk into a single field element.
pub fn bytes_to_field(bytes: [u8; PEDERSEN_FIELD_BYTES]) -> Field {
    let mut f: Field = 0;
    for i in 0..PEDERSEN_FIELD_BYTES {
        f = f * 256 + (bytes[i] as Field);
    }
    f
}

/// Compute the canonical layout hash. `packed_cells` must be the
/// padded array (length = MAX_PACKED_BYTES); the trailing zero bytes
/// are part of the hashed image.
pub fn compute_maze_hash(
    width: u16,
    height: u16,
    start_x: u16,
    start_y: u16,
    robe_x: u16,
    robe_y: u16,
    scepter_x: u16,
    scepter_y: u16,
    goal_x: u16,
    goal_y: u16,
    packed_cells: [u8; MAX_PACKED_BYTES],
) -> Field {
    // Build the canonical 1520-byte layout buffer.
    let mut layout: [u8; LAYOUT_TOTAL_BYTES] = [0; LAYOUT_TOTAL_BYTES];
    let header: [u16; 10] = [
        width, height, start_x, start_y, robe_x, robe_y, scepter_x, scepter_y, goal_x, goal_y,
    ];
    for i in 0..10 {
        layout[i * 2] = (header[i] >> 8) as u8;
        layout[i * 2 + 1] = (header[i] & 0xFF) as u8;
    }
    for i in 0..MAX_PACKED_BYTES {
        layout[LAYOUT_HEADER_BYTES + i] = packed_cells[i];
    }

    // Pack into 50 fields, 31 bytes each (last field zero-padded on the right).
    let mut fields: [Field; LAYOUT_FIELD_COUNT] = [0; LAYOUT_FIELD_COUNT];
    for f in 0..LAYOUT_FIELD_COUNT {
        let mut chunk: [u8; PEDERSEN_FIELD_BYTES] = [0; PEDERSEN_FIELD_BYTES];
        for j in 0..PEDERSEN_FIELD_BYTES {
            let idx = f * PEDERSEN_FIELD_BYTES + j;
            if idx < LAYOUT_TOTAL_BYTES {
                chunk[j] = layout[idx];
            }
        }
        fields[f] = bytes_to_field(chunk);
    }

    pedersen_hash(fields)
}

#[test]
fn test_hash_zeros_is_constant() {
    // Sanity: hashing a fully-zero layout should produce a deterministic,
    // non-zero field element. We don't pin the value here (it's pinned
    // cross-layer by the TS test in ma-6cr.8); we just check it's defined.
    let zero_packed: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    let h = compute_maze_hash(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, zero_packed);
    assert(h != 0);
}

#[test]
fn test_hash_changes_with_input() {
    let zero_packed: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    let h0 = compute_maze_hash(10, 10, 0, 0, 9, 0, 4, 4, 5, 9, zero_packed);
    let h1 = compute_maze_hash(10, 10, 0, 0, 9, 0, 4, 4, 5, 8, zero_packed);
    let h2 = compute_maze_hash(10, 11, 0, 0, 9, 0, 4, 4, 5, 9, zero_packed);
    let h3 = compute_maze_hash(10, 10, 0, 0, 9, 0, 4, 5, 5, 9, zero_packed);

    let mut other_packed: [u8; MAX_PACKED_BYTES] = [0; MAX_PACKED_BYTES];
    other_packed[0] = 1;
    let h4 = compute_maze_hash(10, 10, 0, 0, 9, 0, 4, 4, 5, 9, other_packed);

    assert(h0 != h1);
    assert(h0 != h2);
    assert(h0 != h3);
    assert(h0 != h4);
}
