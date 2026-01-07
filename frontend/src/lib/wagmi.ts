import { createConfig, http } from 'wagmi';
import { localhost, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

/**
 * Wagmi configuration for MazeKing dApp
 * Supports localhost (Anvil) and Sepolia testnet
 */
export const config = createConfig({
  chains: [localhost, sepolia],
  connectors: [injected()],
  transports: {
    [localhost.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(
      import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo'
    ),
  },
  ssr: false,
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
