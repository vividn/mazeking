# MazeKing Prover Circuit

Zero-knowledge proof circuit written in [Noir](https://noir-lang.org/) that verifies maze solutions without revealing the solution path.

## 🎯 Purpose

This circuit allows players to prove they solved a maze without revealing their moves. The proof demonstrates:

- ✅ Starting position was correct
- ✅ Key was collected
- ✅ Goal was reached
- ✅ No walls were crossed
- ✅ Move count is accurate

All without revealing the actual move sequence!

## 📁 Structure

```
maze_prover/
├── src/
│   └── main.nr          # Main circuit logic
├── target/              # Compiled artifacts
│   ├── maze_prover.json # Compiled circuit (9.2 MB)
│   ├── maze_prover.gz   # Compressed circuit
│   └── vk               # Verification key (generated)
├── Nargo.toml           # Circuit configuration
└── README.md
```

## 🔐 Circuit Logic

### Inputs

**Public Inputs** (visible on-chain):
```rust
pub width: Field,           // Maze width
pub height: Field,          // Maze height
pub start_x: Field,         // Starting X coordinate
pub start_y: Field,         // Starting Y coordinate
pub key_x: Field,           // Key X coordinate
pub key_y: Field,           // Key Y coordinate
pub goal_x: Field,          // Goal X coordinate
pub goal_y: Field,          // Goal Y coordinate
pub packed_cells: [u8; 2500], // Maze cells (2 cells per byte)
pub move_count: Field,      // Number of moves
```

**Private Inputs** (hidden):
```rust
moves: [u8; 3000],  // Move sequence (0=UP, 1=RIGHT, 2=DOWN, 3=LEFT)
```

### Constants

```rust
const MAX_CELLS: u32 = 5000;   // Maximum maze size (width * height)
const MAX_MOVES: u32 = 3000;   // Maximum number of moves
```

### Cell Encoding

Cells are packed 2 per byte (4 bits each):

```
Bit 3: southWall (can move down?)
Bit 2: eastWall  (can move right?)
Bit 1-0: cellType (Normal=0, Text=1, ZkText=2, CrownText=3)
```

**Byte Packing**:
- High nibble (bits 7-4): Even-indexed cell
- Low nibble (bits 3-0): Odd-indexed cell

**Example**:
```
packed_cells[0] = 0xAB
  Cell 0 = 0xA (1010 binary)
  Cell 1 = 0xB (1011 binary)
```

### Circuit Flow

```rust
fn main(/* inputs */) {
    // 1. Validate maze size
    assert(width * height <= MAX_CELLS);

    // 2. Initialize state
    let mut pos = (start_x, start_y);
    let mut has_key = false;

    // 3. Simulate each move
    for i in 0..MAX_MOVES {
        if i < move_count {
            let move = moves[i];

            // Check wall collision
            assert(can_move(pos, move, packed_cells));

            // Update position
            pos = apply_move(pos, move, width, height);

            // Check key pickup
            if pos == (key_x, key_y) {
                has_key = true;
            }
        }
    }

    // 4. Verify win conditions
    assert(has_key);           // Must have collected key
    assert(pos == (goal_x, goal_y)); // Must be at goal
}
```

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

Outputs:
- `target/maze_prover.json` - Compiled circuit for frontend
- `target/maze_prover.gz` - Compressed version

### Generate Proof (CLI)

```bash
# Create Prover.toml with inputs
# Then generate proof
nargo prove

# Verify proof
nargo verify
```

### Generate Proof (Frontend)

See `frontend/src/lib/proofService.ts` for JavaScript/TypeScript usage:

```typescript
import { generateProof } from './lib/proofService';

const result = await generateProof({
  width: 10,
  height: 10,
  start_x: 0,
  start_y: 0,
  key_x: 5,
  key_y: 5,
  goal_x: 9,
  goal_y: 9,
  packed_cells: [...], // 2500 bytes
  move_count: 50,
  moves: [...],        // 3000 moves (padded)
});
```

## 🧪 Testing

### Unit Tests

Add tests to `src/main.nr`:

```rust
#[test]
fn test_simple_maze() {
    // Test with a simple maze
    main(/* test inputs */);
}
```

Run tests:

```bash
nargo test
```

### Test Cases

Create test mazes in `test/` directory:

```toml
# test/simple_maze.toml
width = 5
height = 5
start_x = 0
start_y = 0
key_x = 2
key_y = 2
goal_x = 4
goal_y = 4
packed_cells = [...]
move_count = 10
moves = [1, 1, 2, 2, 1, 1, 2, 2, 0, 0]
```

## 📊 Complexity Analysis

### Constraints

- **Width × Height ≤ 5000**: Total maze cells
- **Moves ≤ 3000**: Maximum move sequence length
- **Circuit Size**: ~9.2 MB compiled
- **Proof Time**: 5-10 seconds on modern hardware
- **Proof Size**: ~several KB (varies by input)

### Optimization Opportunities

The circuit can be optimized by:

1. **Dynamic Arrays**: Use actual move count instead of MAX_MOVES loop
2. **Packed Checks**: Batch multiple wall checks
3. **Lookup Tables**: Pre-compute movement validation
4. **Circuit Splitting**: Break into smaller sub-circuits

## 🔧 Customization

### Change Maximum Sizes

Edit `src/main.nr`:

```rust
const MAX_CELLS: u32 = 10000;  // Allow larger mazes
const MAX_MOVES: u32 = 5000;   // Allow more moves
```

**Note**: Larger values increase:
- Compilation time
- Circuit size
- Proof generation time
- Memory usage

### Add Custom Validation

Add additional checks in the main loop:

```rust
// Example: Track cells visited
let mut visited_cells = [false; MAX_CELLS];
visited_cells[pos_to_index(pos)] = true;

// Example: Verify special tiles
if cell_type == ZK_TEXT {
    // Additional validation
}
```

### Modify Cell Encoding

Change encoding in both circuit and frontend serialization:

```rust
// Example: 8-bit cell encoding
struct Cell {
    north_wall: bool,
    south_wall: bool,
    east_wall: bool,
    west_wall: bool,
    cell_type: u4,
}
```

## 📚 Noir Language Basics

### Data Types

```rust
Field         // Prime field element (default integer type)
u8, u16, u32  // Unsigned integers
bool          // Boolean
[T; N]        // Fixed-size array
```

### Control Flow

```rust
// Loops (must be bounded)
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
assert(condition);              // Constraint
assert(a == b);                 // Equality check
assert(can_move(pos, direction)); // Function call
```

### Helper Functions

```rust
fn can_move(pos: (Field, Field), direction: u8, cells: [u8; 2500]) -> bool {
    // Check if move is valid
    // ...
}

fn apply_move(pos: (Field, Field), direction: u8, width: Field, height: Field)
    -> (Field, Field) {
    // Apply move with toroidal wrapping
    // ...
}
```

## 🔗 Integration

### With Frontend

1. **Compile circuit**: `nargo compile`
2. **Copy artifact**: `cp target/maze_prover.json ../frontend/public/circuit/`
3. **Generate proof**: Frontend uses `@noir-lang/noir_js`
4. **Submit on-chain**: Proof + public inputs to smart contract

### With Smart Contract

1. **Generate verifier**: `cd ../contracts && ./scripts/generate-verifier.sh`
2. **Deploy verifier**: Deploy `MazeVerifier.sol`
3. **Integrate**: NFT contract calls `verifier.verify(proof, publicInputs)`

### Data Flow

```
Player solves maze
  ↓
Frontend serializes maze + moves
  ↓
Noir.js generates ZK proof
  ↓
User submits proof to contract
  ↓
Verifier contract validates proof
  ↓
NFT minted if valid
```

## 🐛 Troubleshooting

### Compilation Errors

**"Array size too large"**
- Reduce `MAX_CELLS` or `MAX_MOVES`
- Use dynamic sizing if possible

**"Constraint system too large"**
- Circuit is too complex
- Simplify validation logic
- Remove unnecessary checks

### Proof Generation Fails

**"Witness generation failed"**
- Invalid public inputs
- Private inputs don't satisfy constraints
- Maze not solvable with given moves

**"Out of memory"**
- Proof generation requires significant RAM
- Close other applications
- Use machine with more memory

### Performance Issues

**Slow compilation**
- Large constants increase compile time
- Use `nargo compile --release` for production

**Slow proof generation**
- Expected for large mazes/move sequences
- 5-10 seconds is normal
- Optimize circuit if consistently slow

## 📊 Circuit Statistics

**Current Configuration**:
- MAX_CELLS: 5000
- MAX_MOVES: 3000
- Compiled Size: 9.2 MB
- Public Inputs: 2509 field elements
- Private Inputs: 3000 field elements

**Typical Performance**:
- Compile Time: 1-2 seconds
- Proof Time: 5-10 seconds
- Proof Size: ~several KB
- Verification: Milliseconds

## 🔄 Version History

- **v1.0.0-beta.17**: Initial implementation with UltraHonk backend
- Noir version: 1.0.0-beta.17
- Barretenberg version: Compatible with bb CLI 0.72.1

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

## 🤝 Contributing

Ideas for circuit improvements:

- [ ] Optimize constraint count
- [ ] Add dynamic array sizing
- [ ] Implement efficient path compression
- [ ] Add special tile validation
- [ ] Support multiple key types
- [ ] Optimize wall checking with lookup tables

## 📄 License

MIT

---

For smart contract integration, see [/contracts/README.md](../contracts/README.md)

For frontend usage, see [/frontend/README.md](../frontend/README.md)
