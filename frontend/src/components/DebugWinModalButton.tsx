import { useMemo, useState } from 'react';
import { isLocalhost } from '../lib/debugSeed';
import { generateMaze } from '../lib/mazeGenerator';
import { generateColorScheme } from '../lib/colorGenerator';
import { WinModal } from './WinModal';

const DEBUG_SEED = 'zkDEBUG-winmodal';

/**
 * Floating localhost-only button that opens the WinModal with a synthetic
 * maze and `mockMode=true`. Lets us iterate on the modal without playing
 * through a maze. Hidden in production by `isLocalhost()`.
 */
export function DebugWinModalButton() {
  const [open, setOpen] = useState(false);
  const [iteration, setIteration] = useState(0);

  const synthetic = useMemo(() => {
    const generated = generateMaze(DEBUG_SEED);
    const colors = generateColorScheme(DEBUG_SEED);
    return { generated, colors };
  }, []);

  if (!isLocalhost()) return null;

  const { generated, colors } = synthetic;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIteration((i) => i + 1);
          setOpen(true);
        }}
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          zIndex: 999,
          padding: '8px 12px',
          backgroundColor: '#ff00aa',
          color: '#fff',
          border: '2px dashed #fff',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          fontFamily: 'monospace',
        }}
        aria-label="DEBUG: open the win modal with a mock proof"
        data-testid="debug-win-modal-button"
        title="DEV ONLY (localhost) — open WinModal with mock proof"
      >
        🐞 DEBUG: Win Modal
      </button>
      {open && (
        <WinModal
          key={iteration}
          isOpen
          mockMode
          moveCount={42}
          colors={colors}
          maze={generated.maze}
          moves={[]}
          startPos={generated.kingPos}
          robePos={generated.robePos}
          scepterPos={generated.scepterPos}
          goalPos={generated.goalPos}
          visited={new Set([`${generated.goalPos.x},${generated.goalPos.y}`])}
          copied={false}
          onCopyLink={() => {
            console.log('[DEBUG] share clicked');
          }}
          onNewMaze={() => setOpen(false)}
          onViewCollection={() => {
            console.log('[DEBUG] collection clicked');
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}
