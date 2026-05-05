# MazeKing Frontend

React + Vite web application for playing MazeKing - a blockchain-based maze game with zero-knowledge proof verification and NFT minting.

## 🎮 Features

- **Procedurally Generated Mazes**: Create unique mazes from any seed string
- **Intuitive Controls**: Arrow keys or WASD to navigate
- **ZK Proof Generation**: Client-side proof generation using Noir
- **Web3 Integration**: Connect wallet and mint achievement NFTs
- **Stats Display**: See your move count and time
- **Shareable Mazes**: Copy links to share specific mazes
- **Responsive UI**: Works on desktop browsers

## 📁 Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Game.tsx         # Main game component
│   │   ├── WinModal.tsx     # Victory modal with proof generation
│   │   ├── ProofProgress.tsx # Proof generation progress indicator
│   │   └── ProofImage.tsx   # Proof visualization
│   ├── lib/
│   │   ├── mazeGenerator.ts # Procedural maze generation
│   │   ├── proofService.ts  # ZK proof generation with Noir
│   │   ├── zkSerialize.ts   # Maze serialization for ZK circuit
│   │   ├── wagmi.ts         # Web3 wallet configuration
│   │   ├── contracts.ts     # Contract addresses
│   │   └── abi/             # Contract ABIs
│   ├── hooks/
│   │   ├── useZkProof.ts    # React hook for proof generation
│   │   └── useMintNFT.ts    # React hook for NFT minting
│   ├── types.ts             # TypeScript type definitions
│   └── App.tsx              # Root component
├── public/
│   └── circuit/
│       └── maze_prover.json # Compiled Noir circuit (9.2 MB)
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **pnpm** (or npm/yarn)
- **MetaMask** or another Web3 wallet

### Installation

```bash
cd frontend
pnpm install
```

### Development

```bash
pnpm dev
```

Open http://localhost:5173

### Build

```bash
pnpm build
```

Outputs to `dist/` directory.

### Test

```bash
pnpm test
```

## 🎯 How to Play

### Controls

- **Arrow Keys** or **WASD**: Move player
- **R**: Restart maze
- **N**: New maze
- **Space**: Pause/Resume timer

### Game Flow

1. **Start**: Enter a seed string or use the default
2. **Navigate**: Find the key (🔑) first
3. **Solve**: Reach the goal (🎯) with the key
4. **Victory**: See your move count and time
5. **Generate Proof**: Click to create ZK proof
6. **Mint NFT**: Connect wallet and mint achievement

### Seed-Based Generation

Mazes are deterministically generated from seeds:
- Same seed = same maze every time
- Share seeds via URL: `?seed=your-seed-here`
- Special characters supported: emojis, symbols, etc.

## 🔐 ZK Proof Generation

### How It Works

The frontend generates zero-knowledge proofs using [Noir](https://noir-lang.org/) and [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg):

1. **Serialize Maze**: Convert maze to circuit-compatible format
2. **Load Circuit**: Load compiled circuit from `/public/circuit/`
3. **Initialize Prover**: Set up Noir.js and Barretenberg backend
4. **Generate Witness**: Execute circuit with maze + moves
5. **Generate Proof**: Create UltraHonk proof (~5-10 seconds)
6. **Return Result**: Proof bytes + public inputs

### Proof Service API

```typescript
import { generateProof } from './lib/proofService';

const result = await generateProof(proverInput, (stage, progress) => {
  console.log(`${stage}: ${progress}%`);
});

// result.proof: Uint8Array (raw proof bytes)
// result.publicInputs: string[] (2509 field elements)
```

### Serialization Format

**Public Inputs** (2509 elements):
- 0-7: width, height, start_x, start_y, key_x, key_y, goal_x, goal_y
- 8-2507: packed_cells (2500 bytes, 2 cells per byte)
- 2508: move_count

**Private Inputs**:
- moves: number[] (up to 3000 moves)

See `lib/zkSerialize.ts` for implementation details.

## 🌐 Web3 Integration

### Wallet Connection

Using [wagmi](https://wagmi.sh/) + [viem](https://viem.sh/) for Web3 interactions:

```typescript
import { useAccount, useConnect } from 'wagmi';

const { address, isConnected } = useAccount();
const { connect, connectors } = useConnect();

// Connect wallet
connect({ connector: connectors[0] }); // Injected (MetaMask)
```

### Minting NFTs

```typescript
import { useMintNFT } from './hooks/useMintNFT';

const { mintWithProof, isPending, isSuccess } = useMintNFT();

// Mint with proof
await mintWithProof(proof, publicInputs, moveCount);
```

### Configuration

Update contract addresses in `src/lib/contracts.ts` after deployment:

```typescript
export const CONTRACTS = {
  31337: { // localhost
    nft: '0xYOUR_NFT_ADDRESS',
    verifier: '0xYOUR_VERIFIER_ADDRESS',
  },
  11155111: { // Sepolia
    nft: '0xYOUR_NFT_ADDRESS',
    verifier: '0xYOUR_VERIFIER_ADDRESS',
  },
};
```

### Supported Networks

- **Localhost (31337)**: Anvil local testnet
- **Sepolia (11155111)**: Ethereum testnet

Add more networks in `src/lib/wagmi.ts`.

## 🧩 Component Architecture

### Game.tsx

Main game component managing:
- Maze state
- Player position
- Move history
- Timer
- Win condition
- Keyboard input

### WinModal.tsx

Victory modal featuring:
- Move count display
- Proof generation button
- Proof progress indicator
- Wallet connection
- NFT minting interface
- Transaction status

### ProofProgress.tsx

Visual progress indicator for proof generation stages:
- Loading circuit (10%)
- Initializing Noir (30%)
- Initializing backend (50%)
- Generating witness (60%)
- Generating proof (70%)
- Complete (100%)

### ProofImage.tsx

Displays proof as visual art:
- Converts proof bytes to image
- Shows proof size
- Creative visualization

## 📊 State Management

### Game State

```typescript
interface GameState {
  maze: MazeData;
  playerPos: Position;
  hasKey: boolean;
  hasWon: boolean;
  moves: Move[];
  startTime: number;
  seed: string;
}
```

### Proof State

```typescript
interface ProofState {
  stage: ProofStage;
  progress: number;
  proof?: Uint8Array;
  publicInputs?: string[];
  imageDataUrl?: string;
  error?: string;
}
```

## 🎨 Styling

### Color Schemes

Mazes support custom color themes:

```typescript
interface ColorScheme {
  pathColor: string;        // Background
  wallColor: string;        // Walls
  playerColor: string;      // Player
  keyColor: string;         // Key
  goalColor: string;        // Goal
  textColor: string;        // UI text
  uiAccentColor: string;   // Buttons
  textBackgroundColor: string; // Text backgrounds
}
```

### Responsive Design

- Adapts to window size
- Maintains aspect ratio
- Touch-friendly on tablets

## 🔧 Configuration

### Environment Variables

Create `.env` or `.env.local`:

```bash
# Sepolia RPC URL — required for production deploys.
# Falls back to a public CORS-enabled RPC if unset (see src/lib/wagmi.ts),
# but a dedicated key (Alchemy/Infura/etc) is strongly recommended for
# rate limits and reliability. Do NOT use Alchemy's `demo` key — it
# blocks CORS from non-Alchemy origins.
VITE_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

**Important for static-host deploys:** the env var must be present at
`pnpm build` time (Vite inlines `import.meta.env.VITE_*` into the bundle).
Setting it only at runtime on the host has no effect.

### Build Configuration

See `vite.config.ts` for build settings:
- Polyfills for Node.js modules (buffer)
- Circuit file handling
- Bundle optimization

### Circuit Updates

If the Noir circuit changes:

1. Run `just generate-verifier` from the repo root — this compiles the circuit
   via `noir_wasm`, syncs the artifact into `public/circuit/`, and regenerates
   `contracts/src/generated/MazeVerifier.sol` using `@aztec/bb.js`. No native
   `nargo`/`bb` install required.
2. Redeploy contracts
3. Update frontend contract addresses

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

Tests for:
- Maze generation
- ZK serialization
- Path validation
- Move logic

### E2E Testing

Manual testing checklist:
- [ ] Generate maze from seed
- [ ] Navigate with keyboard
- [ ] Collect key
- [ ] Reach goal
- [ ] Generate proof
- [ ] Connect wallet
- [ ] Mint NFT
- [ ] Verify on-chain

## 📦 Dependencies

### Core

- **React** 18.3.1 - UI framework
- **TypeScript** 5.9.3 - Type safety
- **Vite** 5.4.21 - Build tool

### ZK Proofs

- **@noir-lang/noir_js** 1.0.0-beta.17 - Noir runtime
- **@aztec/bb.js** 2.1.9 - Barretenberg prover
- **buffer** 6.0.3 - Node.js buffer polyfill

### Web3

- **wagmi** 3.2.0 - React hooks for Ethereum
- **viem** 2.43.5 - TypeScript Ethereum library
- **@tanstack/react-query** 5.90.16 - Data fetching

### Dev

- **vitest** 1.6.1 - Test runner
- **@vitejs/plugin-react** 4.7.0 - React plugin for Vite

## 🚀 Deployment

### Build for Production

```bash
pnpm build
```

### Deploy to Vercel/Netlify

```bash
# Build command
pnpm build

# Output directory
dist

# Environment variables (must be set at BUILD time, not runtime —
# Vite inlines VITE_* vars into the static bundle)
VITE_SEPOLIA_RPC_URL=your_rpc_url
```

### Static Hosting

The app is a static SPA - can be hosted anywhere:
- Vercel
- Netlify
- GitHub Pages
- IPFS
- Fleek

**Note**: Circuit file is 9.2 MB - ensure hosting supports large files.

## 🐛 Troubleshooting

### "Failed to load circuit"

- Check `public/circuit/maze_prover.json` exists
- Verify file is valid JSON
- Check dev server is serving static files

### Proof generation hangs

- Check browser console for errors
- Ensure WebAssembly is enabled
- Try in different browser (Chrome/Firefox recommended)
- Close other tabs to free memory

### Wallet won't connect

- Check MetaMask is installed
- Verify network is supported (localhost or Sepolia)
- Check wagmi configuration in `src/lib/wagmi.ts`

### Transaction fails

- Ensure contracts are deployed
- Verify contract addresses in `src/lib/contracts.ts`
- Check wallet has enough ETH for gas
- Verify proof was generated successfully

### Circuit errors

- Check move count doesn't exceed 3000
- Verify maze size doesn't exceed 5000 cells
- Ensure maze is solvable

## 🔍 Performance

### Optimization Tips

- **Proof Generation**: 5-10 seconds for typical mazes
- **Bundle Size**: ~10 MB (mostly circuit file)
- **Memory**: 50-100 MB for proof generation
- **Best Browsers**: Chrome, Firefox (full WebAssembly support)

### Lazy Loading

Circuit is loaded on-demand when proof generation starts:

```typescript
// Circuit loads only when needed
const circuit = await fetch('/circuit/maze_prover.json');
```

## 📚 Additional Resources

- [Noir Documentation](https://noir-lang.org/docs)
- [wagmi Documentation](https://wagmi.sh/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

## 🤝 Contributing

Ideas for frontend improvements:

- [ ] Mobile touch controls
- [ ] Maze replay/animation
- [ ] Leaderboards UI
- [ ] Achievement badges display
- [ ] Share to social media
- [ ] Dark/light theme toggle
- [ ] Accessibility improvements
- [ ] PWA support

## 📄 License

MIT

---

For smart contracts, see [/contracts/README.md](../contracts/README.md)

For ZK circuit details, see [/maze_prover/README.md](../maze_prover/README.md)
