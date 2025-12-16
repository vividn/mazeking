import { useState, useEffect } from 'react';
import { Game } from './components/Game';

function getInitialSeed(): string {
  // Check URL parameter first
  const params = new URLSearchParams(window.location.search);
  const urlSeed = params.get('seed');
  if (urlSeed) {
    return urlSeed;
  }

  // Default seed
  return 'maze 👑king';
}

function App() {
  const [seed, setSeed] = useState(getInitialSeed);

  // Update URL when seed changes
  const handleSeedChange = (newSeed: string) => {
    setSeed(newSeed);

    // Update URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.set('seed', newSeed);
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
