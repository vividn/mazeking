import { useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Game } from './components/Game';
import { filterToValidChars } from './lib/pixelFont';
import { config } from './lib/wagmi';
import { MAX_MAZE_CELLS } from './lib/mazeConstants.generated';

// Create query client for React Query
const queryClient = new QueryClient();

// Sanitize seed: filter invalid chars and collapse multiple spaces
function sanitizeSeed(seed: string): string {
  const filtered = filterToValidChars(seed);
  const collapsed = filtered.replace(/  +/g, ' ').trim();
  return collapsed || 'maze king'; // Fall back to default if empty after sanitization
}

function getInitialSeed(): string {
  // Check URL parameter first
  const params = new URLSearchParams(window.location.search);
  const urlSeed = params.get('seed');
  if (urlSeed) {
    return sanitizeSeed(urlSeed);
  }

  // Default seed
  return DEFAULT_SEED;
}

const DEFAULT_SEED = 'maze♚ ♚king';
export { MAX_MAZE_CELLS };

function App() {
  const [seed, setSeed] = useState(getInitialSeed);

  // Update URL when seed changes
  const handleSeedChange = (newSeed: string) => {
    setSeed(newSeed);

    // Update URL without reloading (omit seed param if default)
    const url = new URL(window.location.href);
    if (newSeed === DEFAULT_SEED) {
      url.searchParams.delete('seed');
    } else {
      url.searchParams.set('seed', newSeed);
    }
    window.history.pushState({}, '', url.toString());
  };

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const newSeed = getInitialSeed();
      setSeed(newSeed);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Game initialSeed={seed} onSeedChange={handleSeedChange} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
