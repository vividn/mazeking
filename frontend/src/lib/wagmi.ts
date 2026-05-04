import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// Anvil uses chain ID 31337 by default (not 1337 like wagmi's localhost)
const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});

/**
 * Wagmi configuration for MazeKing dApp
 * Supports Anvil (localhost) and Sepolia testnet.
 *
 * The first chain in the array is wagmi's default for new connections.
 * Dev: Anvil first (rapid local iteration). Prod: Sepolia first (deployed).
 */
const chainsByMode = import.meta.env.DEV
  ? ([anvil, sepolia] as const)
  : ([sepolia, anvil] as const);

export const config = createConfig({
  chains: chainsByMode,
  connectors: [injected()],
  transports: {
    [anvil.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(
      import.meta.env.VITE_SEPOLIA_RPC_URL ||
        'https://eth-sepolia.g.alchemy.com/v2/demo'
    ),
  },
  ssr: false,
});

export { anvil };

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
