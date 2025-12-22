import { useState, useEffect } from 'react';
import { Game } from './components/Game';
import { filterToValidChars } from './lib/pixelFont';

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
export const MAX_MAZE_CELLS = 5000;

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

  return <Game initialSeed={seed} onSeedChange={handleSeedChange} />;
}

export default App;
