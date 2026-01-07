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
- **Foundry** - Smart contract development
- **Anvil** - Local Ethereum node
- **MetaMask** or another Web3 wallet

### 1. Clone & Install

```bash
git clone <repository-url>
cd vividn-mazeking

# Install frontend dependencies
cd frontend
pnpm install

# Install contract dependencies (Foundry will auto-install)
cd ../contracts
forge install
```

### 2. Deploy Contracts Locally

```bash
# Terminal 1: Start local blockchain
anvil

# Terminal 2: Deploy contracts
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Note the deployed contract addresses from output
```

### 3. Configure Frontend

Update `/frontend/src/lib/contracts.ts` with your deployed addresses:

```typescript
export const CONTRACTS = {
  31337: { // localhost
    nft: '0xYOUR_NFT_ADDRESS',
    verifier: '0xYOUR_VERIFIER_ADDRESS',
  },
};
```

### 4. Start Frontend

```bash
cd frontend
pnpm dev
```

Open http://localhost:5173 and start playing!

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

### Contract Tests

```bash
cd contracts
forge test -vv
```

All 21 tests passing, including:
- ZK proof minting with MockVerifier
- Stats tracking and updates
- Multiple solves of same maze
- Verifier and maze registration
- Access control

### Frontend

```bash
cd frontend
pnpm test
```

## 📦 Deployment

### Local (Anvil)

Already covered in Quick Start. Uses default Anvil test accounts.

### Sepolia Testnet

```bash
# Update contracts/.env with your credentials
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_api_key

# Deploy
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --broadcast --verify

# Update frontend/src/lib/contracts.ts with Sepolia addresses
```

### Mainnet

Same as Sepolia but use mainnet RPC and ensure thorough testing first!

## 🔧 Advanced Configuration

### Generate Real Verifier

The current verifier is a mock (always returns true) for development. To generate the real UltraHonk verifier:

```bash
# Install Noir and Barretenberg
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && bbup -v 0.72.1

# Generate verifier
cd contracts
./scripts/generate-verifier.sh

# Redeploy contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
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
- Verify contract addresses in `frontend/src/lib/contracts.ts`
- Ensure you're connected to the correct network

**"Transaction failed"**
- Check you have enough ETH for gas
- Verify proof was generated successfully
- Check browser console for errors

**"Proof generation failed"**
- Ensure maze is solvable
- Check circuit file exists at `/frontend/public/circuit/maze_prover.json`
- Verify move count doesn't exceed 3000

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
