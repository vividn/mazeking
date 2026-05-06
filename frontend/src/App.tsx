import { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Game, type ReplayPayload } from './components/Game';
import { MyMazesPage } from './components/MyMazesPage';
import { GalleryPage } from './components/GalleryPage';
import { TestnetBanner } from './components/TestnetBanner';
import { DebugWinModalButton } from './components/DebugWinModalButton';
import { filterToValidChars } from './lib/pixelFont';
import { config } from './lib/wagmi';
import { MAX_MAZE_CELLS } from './lib/mazeConstants.generated';

const queryClient = new QueryClient();

function sanitizeSeed(seed: string): string {
  const filtered = filterToValidChars(seed);
  const collapsed = filtered.replace(/  +/g, ' ').trim();
  return collapsed || 'maze king';
}

function readSeedFromURL(): string {
  const params = new URLSearchParams(window.location.search);
  const urlSeed = params.get('seed');
  return urlSeed ? sanitizeSeed(urlSeed) : DEFAULT_SEED;
}

export const DEFAULT_SEED = 'maze♚ ♚king';
export { MAX_MAZE_CELLS };

export interface OutletCtx {
  seed: string;
  selectSeed: (seed: string) => void;
  /**
   * Hand the game a replay payload (decoded from on-chain `layouts(tokenId)`).
   * Navigates to `/` and lets `<Game>` decode the layout via
   * `mazeFromLayoutBytes`. Replaces the prior `selectSeed`-based replay path
   * that relied on a localStorage seed→tokenId bridge.
   */
  selectReplay: (payload: ReplayPayload) => void;
}

export function useAppOutlet(): OutletCtx {
  return useOutletContext<OutletCtx>();
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [seed, setSeed] = useState<string>(readSeedFromURL);
  // Active replay (decoded on-chain layout) overrides seed-driven play. The
  // game returns to seed mode the next time `selectSeed` is called.
  const [replay, setReplay] = useState<ReplayPayload | null>(null);

  const isGameRoute = location.pathname === '/';

  const handleSeedChange = useCallback((newSeed: string) => {
    setSeed(newSeed);
    setReplay(null);
    const url = new URL(window.location.href);
    if (newSeed === DEFAULT_SEED) {
      url.searchParams.delete('seed');
    } else {
      url.searchParams.set('seed', newSeed);
    }
    // Stay on / and update only the query string. We bypass react-router's
    // navigate() here so seed-typing on / doesn't churn the route's history
    // entries — same semantics as before routing was introduced.
    window.history.pushState({}, '', url.toString());
  }, []);

  const selectSeed = useCallback(
    (newSeed: string) => {
      setSeed(newSeed);
      setReplay(null);
      const params = new URLSearchParams();
      if (newSeed !== DEFAULT_SEED) params.set('seed', newSeed);
      const search = params.toString();
      navigate(search ? `/?${search}` : '/');
    },
    [navigate]
  );

  const selectReplay = useCallback(
    (payload: ReplayPayload) => {
      setReplay(payload);
      // Drop any ?seed= from the URL — replay is identified by tokenId, not
      // by a typeable seed string.
      navigate('/');
    },
    [navigate]
  );

  // Browser back/forward updates seed when we land back on / with a different
  // ?seed query. Route-level back/forward is already handled by react-router.
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === '/') {
        setSeed(readSeedFromURL());
        setReplay(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const ctx: OutletCtx = { seed, selectSeed, selectReplay };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
      }}
    >
      <TestnetBanner />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          style={{
            display: isGameRoute ? 'flex' : 'none',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
          }}
        >
          <Game
            initialSeed={seed}
            onSeedChange={handleSeedChange}
            active={isGameRoute}
            replay={replay}
          />
        </div>
        {!isGameRoute && <Outlet context={ctx} />}
      </div>
      <DebugWinModalButton />
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={null} />
              <Route path="mazes" element={<MyMazesPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
