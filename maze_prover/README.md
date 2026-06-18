# MazeKing Prover Circuit

Zero-knowledge proof circuit written in [Noir](https://noir-lang.org/) that verifies maze solutions **without revealing the maze layout or the solution path**.

## 🎯 Purpose

This circuit lets a player prove they solved a maze while keeping the maze itself private. The only thing published on-chain is a `maze_hash` (a commitment to the layout) and the number of moves used. The proof demonstrates that, for *some* layout matching that hash:

- ✅ Starting position was within bounds
- ✅ Both the **robe** and the **scepter** were collected (in any order)
- ✅ The goal was reached
- ✅ No walls were crossed
- ✅ The private layout matches the public `maze_hash`

…all without revealing the dimensions, the special positions, the cell layout, or the move sequence.

> **Privacy model:** the maze layout is **PRIVATE**. It is bound to the public
> `maze_hash` via a Pedersen hash (`compute_maze_hash`). Publishing the hash
> commits to a layout without disclosing it; the proof guarantees the private
> witness matches that commitment.

## 📁 Structure

```
maze_prover/
├── src/
│   ├── main.nr            # Proof entry point: hash binding + verify_solution
│   ├── hash.nr            # compute_maze_hash (Pedersen, BN254)
│   ├── types.nr           # Position, Cell, direction & cell-type constants
│   ├── position.nr        # next_position (toroidal), cell/wall indexing
│   ├── walls.nr           # can_move wall-crossing check
│   └── fixtures_codegen.nr# Emits cross-layer Pedersen fixtures for tests
├── target/                # Compiled artifacts
│   ├── maze_prover.json   # Compiled circuit (consumed by the frontend)
│   └── vk                 # Verification key (generated)
├── Nargo.toml             # Circuit configuration
└── README.md
```

## 🔐 Circuit Logic

### Inputs

The signature lives in [`src/main.nr`](src/main.nr). There are exactly **two**
public inputs; everything describing the maze and the solution is private
witness.

**Public Inputs** (committed to in the verifier):
```rust
maze_hash:  pub Field,   // Pedersen hash of the canonical layout (see hash.nr)
move_count: pub u32,     // Number of moves used in the solution
```

**Private Inputs** (witness only — never revealed):
```rust
width:        u16,                    // Maze width
height:       u16,                    // Maze height
start_x:      u16,                    // Starting X
start_y:      u16,                    // Starting Y
robe_x:       u16,                    // Robe X
robe_y:       u16,                    // Robe Y
scepter_x:    u16,                    // Scepter X
scepter_y:    u16,                    // Scepter Y
goal_x:       u16,                    // Goal X
goal_y:       u16,                    // Goal Y
packed_cells: [u8; 1500],             // Maze cells, 2 per byte (MAX_PACKED_BYTES)
moves:        [u8; 1000],             // Move sequence (MAX_MOVES, 0=UP 1=RIGHT 2=DOWN 3=LEFT)
```

The Pedersen hash binds the private layout (dimensions + the four special
positions + `packed_cells`) to the public `maze_hash`. After that binding,
mutating any byte of the layout invalidates the proof — so the hash *is* the
public commitment to a maze the verifier never sees.

### Constants

Defined in [`src/main.nr`](src/main.nr) (and mirrored in [`src/hash.nr`](src/hash.nr)):

```rust
global MAX_MAZE_CELLS:   u32 = 3000;                 // Max width * height
global MAX_PACKED_BYTES: u32 = MAX_MAZE_CELLS / 2;   // 1500 (2 cells per byte)
global MAX_MOVES:        u32 = 1000;                 // Max move sequence length
```

### Cell Encoding

Cells are packed 2 per byte (4 bits each), defined in [`src/types.nr`](src/types.nr):

```
Bit 3: southWall (blocks moving down?)
Bit 2: eastWall  (blocks moving right?)
Bits 1-0: cellType (Normal=0, Text=1, ZkText=2, Crown=3)
```

**Byte Packing**:
- High nibble (bits 7-4): Even-indexed cell
- Low nibble (bits 3-0): Odd-indexed cell

**Example**:
```
packed_cells[0] = 0xAB
  Cell 0 = 0xA (1010 binary) → south wall, cellType 2 (ZkText)
  Cell 1 = 0xB (1011 binary) → south wall, cellType 3 (Crown)
```

Movement uses **toroidal wrapping** (`next_position` in `position.nr`): stepping
off one edge re-enters from the opposite edge. Wall checks (`can_move` in
`walls.nr`) consult the `southWall`/`eastWall` bits of the appropriate cell.

### Maze Hash (the public commitment)

`compute_maze_hash` in [`src/hash.nr`](src/hash.nr) serializes the layout into a
canonical **1520-byte** buffer and hashes it with `std::hash::pedersen_hash`
(BN254, `hash_index = 0`):

```
bytes[ 0.. 2] = width   (big-endian u16)
bytes[ 2.. 4] = height
bytes[ 4.. 6] = start_x
bytes[ 6.. 8] = start_y
bytes[ 8..10] = robe_x
bytes[10..12] = robe_y
bytes[12..14] = scepter_x
bytes[14..16] = scepter_y
bytes[16..18] = goal_x
bytes[18..20] = goal_y
bytes[20..1520] = packed_cells (padded to MAX_PACKED_BYTES with zeros)
```

The 1520 bytes are packed into **50 field elements** at 31 bytes each
(`1520 / 31 = 49 r 1`, so the 50th field is right-padded with zeros). The TS
frontend computes the matching hash via `bb.js`'s `pedersenHash(fields, 0)`; the
Solidity contract trusts the caller-supplied hash because the proof binds it to
the layout.

### Circuit Flow

```rust
fn main(maze_hash: pub Field, move_count: pub u32, /* private layout + moves */) {
    // 1. Bind the public hash to the private layout. After this assertion,
    //    any change to the layout witness invalidates the proof.
    let computed = compute_maze_hash(
        width, height, start_x, start_y,
        robe_x, robe_y, scepter_x, scepter_y,
        goal_x, goal_y, packed_cells,
    );
    assert(computed == maze_hash);

    // 2. Verify the solution path against that (now-committed) layout.
    verify_solution(/* layout + move_count + moves */);
}

fn verify_solution(/* ... */) {
    // Validate dimensions and start bounds
    assert(width * height <= MAX_MAZE_CELLS);
    assert(move_count <= MAX_MOVES);
    assert((width > 0) & (height > 0));
    assert((start_x < width) & (start_y < height));

    let mut pos = Position::new(start_x, start_y);
    let mut has_robe    = pos.equals(robe_pos);     // starting on a piece counts
    let mut has_scepter = pos.equals(scepter_pos);

    for i in 0..MAX_MOVES {
        if i < move_count {
            let direction = moves[i];
            assert(direction <= DIR_LEFT);                  // 0..=3
            assert(can_move(packed_cells, pos, direction, width, height)); // no wall
            pos = next_position(pos, direction, width, height);            // toroidal
            if pos.equals(robe_pos)    { has_robe = true; }
            if pos.equals(scepter_pos) { has_scepter = true; }
        }
    }

    // Win conditions: BOTH pieces collected, then standing on the goal.
    assert(has_robe);
    assert(has_scepter);
    assert(pos.equals(goal_pos));
}
```

There is no single "key" — the player must collect **both** the robe and the
scepter (in any order) before finishing on the goal.

## 🚀 Usage

### Prerequisites

```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
noirup
```

### Compile Circuit

```bash
nargo compile
```

Outputs `target/maze_prover.json` — the compiled circuit consumed by the frontend.

### Generate Proof (CLI)

```bash
# Create Prover.toml with the public + private inputs, then:
nargo execute   # generate the witness
# Proving/verifying is done via the Barretenberg (bb) backend / the frontend.
```

### Generate Proof (Frontend)

See `frontend/src/lib/proofService.ts` (proving) and
`frontend/src/lib/zkSerialize.ts` (input serialization). The prover input shape
is pinned to the circuit ABI in `frontend/src/lib/proverInput.generated.ts`:

```typescript
import { generateProof } from './lib/proofService';

// proverInput is produced by generateProverInput() in zkSerialize.ts.
// Shape mirrors the circuit's main() signature: 2 public fields, the rest private.
const proverInput = {
  // public
  maze_hash: '0x...',   // Pedersen commitment to the layout
  move_count: 11,
  // private
  width: 10, height: 10,
  start_x: 0, start_y: 0,
  robe_x: 9, robe_y: 0,
  scepter_x: 9, scepter_y: 9,
  goal_x: 5, goal_y: 9,
  packed_cells: [/* ... padded to 1500 bytes */],
  moves: [/* ... padded to 1000 entries */],
};

const { proof, publicInputs } = await generateProof(proverInput);
// publicInputs = [maze_hash, move_count] — the only values revealed on-chain.
```

## 🧪 Testing

Tests live alongside the circuit modules (`main.nr`, `hash.nr`, `types.nr`,
`position.nr`, `walls.nr`). They cover the dual robe+scepter collection rule,
toroidal wraparound, start-on-collectable, wall crossing, and end-to-end hash
binding (`test_main_4x4_with_hash`, `test_main_rejects_wrong_hash`).

Run them:

```bash
nargo test
```

A minimal valid solution exercises `main` with a layout, its matching
`compute_maze_hash`, and a move sequence that collects both pieces and lands on
the goal — see `test_main_4x4_with_hash` in `src/main.nr`.

## 📊 Complexity Analysis

### Constraints

- **Width × Height ≤ 3000** (`MAX_MAZE_CELLS`): total maze cells
- **Moves ≤ 1000** (`MAX_MOVES`): maximum move sequence length
- **packed_cells**: `[u8; 1500]` (`MAX_PACKED_BYTES`)
- **Proof Time**: a few seconds on modern hardware
- **Proof Size**: ~several KB (varies by input)

### Optimization Opportunities

The circuit can be optimized by:

1. **Dynamic Arrays**: avoid iterating the full `MAX_MOVES` loop
2. **Packed Checks**: batch multiple wall checks
3. **Lookup Tables**: pre-compute movement validation
4. **Circuit Splitting**: break into smaller sub-circuits

## 🔧 Customization

### Change Maximum Sizes

Edit the globals in `src/main.nr` (and keep `MAX_PACKED_BYTES` in `src/hash.nr`
consistent — the hash buffer size depends on it):

```rust
global MAX_MAZE_CELLS: u32 = 6000;  // Allow larger mazes
global MAX_MOVES:      u32 = 2000;  // Allow more moves
```

**Note**: Larger values increase compilation time, circuit size, proof
generation time, and memory usage. Changing the layout size also changes
`maze_hash`, so the frontend and any pinned fixtures must be regenerated.

### Modify Cell Encoding

Cell encoding is defined in `src/types.nr`. Any change must be mirrored in the
frontend serialization (`frontend/src/lib/zkSerialize.ts`) and will change the
computed `maze_hash`.

## 📚 Noir Language Basics

### Data Types

```rust
Field         // Prime field element
u8, u16, u32  // Unsigned integers (positions are u16; maze_hash is Field)
bool          // Boolean
[T; N]        // Fixed-size array
```

### Control Flow

```rust
// Loops (must be bounded by a compile-time constant)
for i in 0..MAX_MOVES {
    // ...
}

// Conditionals
if condition {
    // ...
} else {
    // ...
}
```

### Assertions

```rust
assert(condition);                                       // Constraint
assert(computed == maze_hash);                           // Hash binding
assert(can_move(packed_cells, pos, direction, width, height)); // Wall check
```

## 🔗 Integration

### With Frontend

1. **Compile circuit**: `nargo compile`
2. **Publish artifact**: the frontend loads `/circuit/maze_prover.json`
3. **Generate proof**: frontend uses `@noir-lang/noir_js` + `@aztec/bb.js`
4. **Submit on-chain**: proof + the two public inputs (`maze_hash`, `move_count`)

### With Smart Contract

1. **Generate verifier** (from repo root): `just generate-verifier` (Node-only, no native `bb`/`nargo` needed)
2. **Deploy verifier**: Deploy `MazeVerifier.sol`
3. **Integrate**: NFT contract calls `verifier.verify(proof, publicInputs)` with `publicInputs = [maze_hash, move_count]`

### Data Flow

```
Player solves maze
  ↓
Frontend serializes layout + moves, computes maze_hash
  ↓
Noir.js generates ZK proof (layout + moves stay private)
  ↓
User submits proof + [maze_hash, move_count] to contract
  ↓
Verifier contract validates proof
  ↓
NFT minted if valid
```

## 🐛 Troubleshooting

### Compilation Errors

**"Array size too large" / "Constraint system too large"**
- Reduce `MAX_MAZE_CELLS` or `MAX_MOVES`
- Simplify validation logic

### Proof Generation Fails

**"Witness generation failed"**
- The private layout does not match the public `maze_hash`
- Private inputs don't satisfy the constraints (missed robe/scepter, hit a wall, wrong end cell)
- Maze not solvable with the given moves

**"Out of memory"**
- Proof generation requires significant RAM; close other applications or use a larger machine

## 📊 Circuit Statistics

**Current Configuration**:
- MAX_MAZE_CELLS: 3000
- MAX_MOVES: 1000
- MAX_PACKED_BYTES: 1500
- **Public Inputs: 2** (`maze_hash`, `move_count`)
- Private Inputs: the full layout witness (dimensions, robe/scepter/goal/start positions, `packed_cells`) plus the `moves` array

**Typical Performance**:
- Compile Time: 1-2 seconds
- Proof Time: a few seconds
- Proof Size: ~several KB
- Verification: Milliseconds

## 🔄 Version History

- **v1.0.0-beta.17**: UltraHonk backend
- Noir version: 1.0.0-beta.17
- Barretenberg: compatible with bb CLI 0.72.1

## 📝 Development

### Format Code

```bash
nargo fmt
```

### Check for Errors

```bash
nargo check
```

### Clean Build

```bash
nargo clean
rm -rf target/
```

## 📚 Resources

- [Noir Language Documentation](https://noir-lang.org/docs)
- [Noir Standard Library](https://noir-lang.org/docs/noir/standard_library/array_methods)
- [UltraHonk Backend](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Example Circuits](https://github.com/noir-lang/noir-examples)

## 📄 License

MIT

---

For smart contract integration, see [/contracts/README.md](../contracts/README.md)

For frontend usage, see [/frontend/README.md](../frontend/README.md)
