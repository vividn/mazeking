# 👑 MAZE KING

A blockchain-based maze game where players solve procedurally generated mazes and mint achievement NFTs by proving their solutions with zero-knowledge proofs.

## 🎮 Features

- **Procedurally Generated Mazes**: Unique mazes generated from seed strings
- **Zero-Knowledge Proofs**: Prove you solved a maze without revealing your solution path
- **Achievement NFTs**: Mint ERC-1155 NFTs for each maze you solve
- **Stats Tracking**: Track your best scores, solve count, and earned badges
- **Web3 Integration**: Connect your wallet to mint NFTs on-chain
- **Multiple Networks**: Supports local (Anvil) and Sepolia testnet

## 📁 Project Structure

```
vividn-mazeking/
├── frontend/           # React + Vite game interface
│   ├── src/
│   │   ├── components/ # Game UI components
│   │   ├── lib/       # ZK proof generation, Web3 integration
│   │   └── hooks/     # React hooks for minting, proofs
│   └── public/
│       └── circuit/   # Compiled Noir circuit
│
├── contracts/         # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── MazeKingNFT.sol      # Main NFT contract with ZK verification
│   │   └── generated/            # Auto-generated verifier
│   ├── test/                     # Contract tests (21/21 passing)
│   └── script/                   # Deployment scripts
│
├── maze_prover/       # Noir ZK circuit
│   ├── src/
│   │   └── main.nr    # Maze solution verification circuit
│   └── target/        # Compiled circuit artifacts
│
└── IMPLEMENTATION_SUMMARY.md  # Detailed implementation guide
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18+) and **pnpm**
- **Foundry** - Smart contract development (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **Noir** - ZK circuit compiler (`curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup`)
- **Barretenberg** - ZK proving backend (`curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && bbup -v 0.72.1`)
- **just** - Command runner (`cargo install just` or `brew install just`)
- **MetaMask** or another Web3 wallet

### Installation & Setup

```bash
# Clone repository
git clone <repository-url>
cd vividn-mazeking

# Install all dependencies
just setup
```

### Development Workflow

```bash
# 1. Compile circuits and sync to frontend
just compile-circuits

# 2. Deploy contracts locally (auto-starts Anvil)
just deploy-local

# 3. Start frontend dev server
just dev

# Or start everything at once
just dev-full
```

Open http://localhost:5173 and start playing!

### Key Commands

```bash
# Development
just dev              # Start frontend dev server
just dev-full         # Start Anvil + frontend together
just status           # Show project status

# Build & Compile
just compile-circuits # Compile Noir circuits + sync to frontend
just build           # Build everything for production
just generate-verifier # Regenerate Solidity verifier from circuit

# Testing
just test            # Run all tests (circuits + contracts + frontend)
just test-contracts  # Run Foundry tests
just test-frontend   # Run Vitest tests
just test-circuits   # Run Noir tests
just integration-test # Full E2E integration test

# Deployment
just deploy-local    # Deploy to local Anvil (auto-starts if needed)
just deploy-sepolia  # Deploy to Sepolia testnet

# Code Quality
just format          # Format all code (Solidity + TypeScript + Noir)
just lint            # Lint all code
just clean           # Clean build artifacts
just reset           # Clean + reinstall dependencies

# Monitoring
just logs-anvil      # Tail Anvil logs
just stop-anvil      # Stop Anvil process

# See all commands
just --list
```

## 🎯 How to Play

1. **Generate a Maze**: Enter a seed string or use the default
2. **Solve the Maze**:
   - Use arrow keys or WASD to move
   - Collect the key (🔑) first
   - Reach the goal (🎯)
3. **Generate Proof**: Click "Create Zero Knowledge Proof"
4. **Mint NFT**:
   - Connect your wallet
   - Click "Mint Achievement NFT"
   - Approve the transaction
5. **Track Stats**: Your best scores and solve counts are stored on-chain

## 🔐 How It Works

### Zero-Knowledge Proofs

The game uses [Noir](https://noir-lang.org/) to generate zero-knowledge proofs that you solved a maze without revealing your solution path. The proof includes:

- **Public Inputs**: Maze definition (walls, dimensions, positions)
- **Private Inputs**: Your move sequence
- **Verification**: On-chain proof verification before minting

### Smart Contracts

**MazeKingNFT.sol** - ERC-1155 NFT contract featuring:
- `mintWithProof()` - Verify ZK proof and mint achievement NFT
- Stats tracking per user per maze
- Badge system (Verified, Robot, Gold, Silver, Copper, Stone)
- Updatable verifier contract
- Role-based access control (Owner, Withdrawer, Registrar, Minter)

**Token ID Calculation**:
```
tokenId = keccak256(maze_definition)
```
Each unique maze gets one token ID. Multiple solves update your stats but don't mint additional NFTs.

### Tech Stack

- **Frontend**: React, TypeScript, Vite, wagmi, viem
- **Contracts**: Solidity, Foundry, OpenZeppelin
- **ZK Proofs**: Noir, Barretenberg (UltraHonk)
- **Blockchain**: Ethereum-compatible (local/testnet/mainnet)

## 📊 Stats & Achievements

For each maze you solve, the contract tracks:

- **minMoves**: Your best score (fewest moves)
- **timesSolved**: How many times you've solved this maze
- **badges**: Earned achievements (32-bit bitfield)
- **usdcDonated**: Future feature for donations

### Badge System

- 🔒 **BADGE_VERIFIED** (0): Proof-verified solve
- 🤖 **BADGE_ROBOT** (1): Perfect/optimal solution
- 🥇 **BADGE_GOLD** (2): <1.05x optimal moves
- 🥈 **BADGE_SILVER** (3): <1.15x optimal moves
- 🥉 **BADGE_COPPER** (4): <1.25x optimal moves
- 🪨 **BADGE_STONE** (5): Maximum possible moves
- Badges 6-31: Reserved for future achievements

## 🧪 Testing

```bash
# Run all tests across all components
just test

# Or run individually
just test-contracts  # Foundry contract tests (21/21 passing)
just test-frontend   # Vitest frontend tests
just test-circuits   # Noir circuit tests

# Full integration test (E2E workflow validation)
just integration-test
```

All 21 contract tests passing, including:
- ZK proof minting with MockVerifier
- Stats tracking and updates
- Multiple solves of same maze
- Verifier and maze registration
- Access control

## 📦 Deployment

### Local (Anvil)

```bash
# Auto-starts Anvil, deploys contracts, generates frontend config
just deploy-local
```

Uses default Anvil test accounts. Frontend config is auto-generated at `frontend/src/lib/contracts.generated.ts`.

### Sepolia Testnet

```bash
# 1. Copy .env.example and configure
cp .env.example .env

# 2. Edit .env with your credentials
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_private_key_here

# 3. Deploy (auto-generates frontend config)
just deploy-sepolia
```

The frontend will automatically use the deployed Sepolia addresses.

### Mainnet

Same as Sepolia but use mainnet RPC and ensure thorough testing first!

## 🔧 Advanced Configuration

### Generate Real Verifier

The current verifier is a mock (always returns true) for development. To generate the real UltraHonk verifier:

```bash
# Install Noir and Barretenberg (if not already installed)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && bbup -v 0.72.1

# Generate verifier
just generate-verifier

# Redeploy contracts
just deploy-local
```

### Customize Maze Generation

Edit `/frontend/src/lib/mazeGenerator.ts` to adjust:
- Maximum maze size (default: 5000 cells)
- Generation algorithm
- Wall density
- Spawn point logic

### Modify Circuit

Edit `/maze_prover/src/main.nr` to change:
- Maximum moves (default: 3000)
- Validation logic
- Public/private input structure

After modifying, regenerate the verifier and redeploy contracts.

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- [ ] Badge calculation logic (optimal move detection)
- [ ] Placement badges (1st, 2nd, 3rd solvers)
- [ ] Special achievement badges
- [ ] Token metadata service
- [ ] Leaderboard system
- [ ] USDC donation integration
- [ ] Mobile-friendly UI improvements

## 📝 Documentation

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Detailed implementation guide
- [contracts/README.md](./contracts/README.md) - Smart contract documentation
- [frontend/README.md](./frontend/README.md) - Frontend documentation
- [maze_prover/README.md](./maze_prover/README.md) - Noir circuit documentation

## 🐛 Troubleshooting

**"Contract not deployed on this network"**
- Run `just deploy-local` to deploy contracts and auto-generate config
- Check `just status` to see deployment status
- Ensure you're connected to the correct network in MetaMask

**"Transaction failed"**
- Check you have enough ETH for gas
- Verify proof was generated successfully
- Check browser console for errors

**"Proof generation failed"**
- Ensure maze is solvable
- Run `just compile-circuits` to sync circuit file
- Check circuit file exists: `just status`
- Verify move count doesn't exceed 3000

**"Anvil connection failed"**
- Check if Anvil is running: `just status`
- Start/restart Anvil: `just stop-anvil && just deploy-local`
- Check logs: `just logs-anvil`

**Build or deployment issues**
- Run `just clean` to remove stale artifacts
- Run `just reset` for a complete fresh start
- Check tool versions: `just status`

## 📄 License

MIT

## 🙏 Acknowledgments

- [Noir](https://noir-lang.org/) - Zero-knowledge proof language
- [Foundry](https://book.getfoundry.sh/) - Ethereum development toolkit
- [OpenZeppelin](https://openzeppelin.com/) - Secure smart contract library
- [wagmi](https://wagmi.sh/) - React hooks for Ethereum

---

**Built with care and love** 💜

Play at your own risk. Smart contracts are provided as-is. Always DYOR before interacting with blockchain applications.
