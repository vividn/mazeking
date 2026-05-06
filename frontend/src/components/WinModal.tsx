import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import type { ColorScheme, MazeData, Move, Position } from '../types';
import { useZkProof } from '../hooks/useZkProof';
import { useMintNFT } from '../hooks/useMintNFT';
import { ProofImage } from './ProofImage';
import { Maze } from './Maze';
import { areContractsDeployed } from '../lib/contracts';
import { sepolia } from 'wagmi/chains';
import { computeOptimalMoves, tierFromMoveCount } from '../lib/mazeSolver';
import { pickTextColor } from '../lib/contrastText';
import kingUrl from '../glyphs/king.png?url';

interface WinModalProps {
  isOpen: boolean;
  moveCount: number;
  onNewMaze: () => void;
  colors: ColorScheme;
  onCopyLink: () => void;
  copied: boolean;
  maze: MazeData;
  moves: Move[];
  startPos: Position;
  robePos: Position;
  scepterPos: Position;
  goalPos: Position;
  visited: Set<string>;
  onViewCollection: () => void;
  /** Close the modal (e.g. via Escape or backdrop). */
  onDismiss: () => void;
  /**
   * When true, useZkProof runs in mock mode (4s timeout, random 9088-byte
   * proof). Used by the localhost DEBUG button. Mint button is rendered but
   * a click resolves immediately without touching a wallet.
   */
  mockMode?: boolean;
}

function getSubtitleVariant(moveCount: number, maze: MazeData): string {
  const area = maze.width * maze.height;
  if (moveCount <= area * 0.35) return 'A royal-class solve';
  if (moveCount <= area * 0.65) return 'Worthy of the throne';
  if (moveCount <= area * 1.1) return 'A king is born';
  return 'You have conquered the maze';
}

interface ConfettiCanvasProps {
  colors: ColorScheme;
  active: boolean;
}

function ConfettiCanvas({ colors, active }: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const palette = [
      colors.uiAccentColor,
      colors.keyColor,
      colors.goalColor,
      colors.playerColor,
      colors.pathColor,
    ];

    const COUNT = 28;
    const particles = Array.from({ length: COUNT }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.4,
      y: h * 0.35 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 4,
      vy: -2 - Math.random() * 4,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.2,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 0,
    }));

    const TTL = 110;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of particles) {
        p.life++;
        if (p.life > TTL) continue;
        alive = true;
        p.vy += 0.12;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        const fade = Math.max(0, 1 - p.life / TTL);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [active, colors]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    />
  );
}

interface ProofPlaceholderProps {
  size: number;
  accentColor: string;
}

/**
 * Pre-proof placeholder: solid black box at the proof image's final
 * dimensions, with concentric squares pulsing in the accent color.
 * Replaces the linear progress bar — a polished "something is happening"
 * affordance, no concrete progress claim.
 */
function ProofPlaceholder({ size, accentColor }: ProofPlaceholderProps) {
  return (
    <div
      data-testid="proof-placeholder"
      style={{
        width: size,
        height: size,
        backgroundColor: '#000',
        borderRadius: '8px',
        border: `2px solid ${accentColor}`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      }}
      role="status"
      aria-label="Generating proof"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '40%',
            height: '40%',
            border: `2px solid ${accentColor}`,
            borderRadius: '4px',
            transform: 'translate(-50%, -50%)',
            animation: `proofPulse 1.6s ease-in-out ${i * 0.4}s infinite`,
            opacity: 0,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          animation: 'proofScan 2.2s linear infinite',
        }}
      />
    </div>
  );
}

function stageHelperText(stage: string): string {
  switch (stage) {
    case 'loading-circuit':
      return 'Loading circuit…';
    case 'initializing-noir':
      return 'Initializing Noir…';
    case 'initializing-backend':
      return 'Starting prover backend…';
    case 'generating-witness':
      return 'Computing witness…';
    case 'generating-proof':
      return 'Proving…';
    case 'idle':
      return 'Preparing zero-knowledge proof…';
    default:
      return 'Generating zero-knowledge proof…';
  }
}

export function WinModal({
  isOpen,
  moveCount,
  onNewMaze,
  colors,
  onCopyLink,
  copied,
  maze,
  moves,
  startPos,
  robePos,
  scepterPos,
  goalPos,
  visited,
  onViewCollection,
  onDismiss,
  mockMode = false,
}: WinModalProps) {
  const {
    state: proofState,
    startProofGeneration,
    reset: resetProof,
  } = useZkProof(maze, moves, startPos, robePos, scepterPos, goalPos, {
    mockMode,
  });

  const crownTier = useMemo(() => {
    if (!isOpen) return undefined;
    const optimal = computeOptimalMoves(
      maze,
      startPos,
      robePos,
      scepterPos,
      goalPos
    );
    return tierFromMoveCount(moveCount, optimal);
  }, [isOpen, maze, startPos, robePos, scepterPos, goalPos, moveCount]);

  // Delay mounting the maze thumbnail until after the modal slide-in animation
  // settles, so canvas measurement uses final post-transform dimensions.
  const [thumbReady, setThumbReady] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setThumbReady(false);
      return;
    }
    const t = window.setTimeout(() => setThumbReady(true), 420);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Wallet connection
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();

  const {
    mintWithProof,
    isPending,
    isConfirming,
    isSuccess,
    errorMessage: mintErrorMessage,
  } = useMintNFT();

  const contractsDeployed = chain ? areContractsDeployed(chain.id) : false;
  const onSepolia = chain?.id === sepolia.id;
  const sepoliaSupported = areContractsDeployed(sepolia.id);
  const proofReady = proofState.stage === 'complete';
  const minting = isPending || isConfirming;

  // Auto-start proof generation when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    if (proofState.stage !== 'idle') return;
    void startProofGeneration();
  }, [isOpen, proofState.stage, startProofGeneration]);

  const handleMint = async () => {
    if (mockMode) {
      console.log('[mockMode] Skipping real mint; visual review only.');
      return;
    }
    if (!isConnected) {
      const connector = connectors[0];
      if (connector) connect({ connector });
      return;
    }
    if (!onSepolia && sepoliaSupported) {
      switchChain({ chainId: sepolia.id });
      return;
    }
    if (!proofReady || !proofState.proof || !proofState.mazeHash || !proofState.layoutBytes) {
      return;
    }
    try {
      await mintWithProof(
        proofState.proof,
        proofState.mazeHash,
        proofState.layoutBytes,
        moveCount
      );
    } catch (err) {
      console.error('mintWithProof threw:', err);
    }
  };

  const handleNewMaze = () => {
    resetProof();
    onNewMaze();
  };

  // Escape closes the modal. Skip while a real proof is mid-flight so we
  // don't tear down the in-flight pipeline mid-keypress.
  const isProving =
    proofState.stage !== 'idle' &&
    proofState.stage !== 'complete' &&
    proofState.stage !== 'error';
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (!isProving || mockMode)) {
        e.preventDefault();
        resetProof();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isProving, mockMode, resetProof, onDismiss]);

  if (!isOpen) return null;

  const subtitle = getSubtitleVariant(moveCount, maze);

  // Compute Mint button label + disabled-reason in one place so they stay in sync.
  let mintLabel = 'Mint NFT';
  let mintDisabledReason: string | null = null;
  let mintDisabled = false;
  if (isSuccess) {
    mintLabel = '✓ Minted';
    mintDisabled = true;
  } else if (mockMode) {
    mintLabel = proofReady ? 'Mint NFT (mock)' : 'Mint NFT';
    mintDisabled = !proofReady;
    mintDisabledReason = proofReady ? null : 'Generating proof…';
  } else if (!proofReady) {
    mintDisabled = true;
    mintDisabledReason = 'Generating proof…';
  } else if (!isConnected) {
    mintLabel = 'Connect Wallet';
  } else if (!onSepolia) {
    mintLabel = sepoliaSupported ? 'Switch to Sepolia' : 'Wrong network';
    mintDisabled = !sepoliaSupported;
    mintDisabledReason = sepoliaSupported
      ? null
      : `Contracts not deployed on ${chain?.name ?? 'this network'}`;
  } else if (!contractsDeployed) {
    mintDisabled = true;
    mintDisabledReason = `Contracts not deployed on ${chain?.name ?? 'this network'}`;
  } else if (minting) {
    mintLabel = isPending ? 'Preparing…' : 'Confirming…';
    mintDisabled = true;
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.modalOverlayColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 0.3s ease-out',
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: colors.pathColor,
    borderRadius: '16px',
    padding: '22px 24px',
    maxWidth: '680px',
    width: '92%',
    maxHeight: '95vh',
    overflowY: 'auto',
    boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 2px ${colors.uiAccentColor}`,
    position: 'relative',
    animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  const kingHeroStyle: React.CSSProperties = {
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxWidth: '120px',
    maxHeight: '110px',
    filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35))',
    flexShrink: 0,
  };

  const heroTextStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '30px',
    fontWeight: 'bold',
    margin: 0,
    color: colors.playerColor,
    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.2)',
    lineHeight: 1.05,
  };

  const heroSubtitleStyle: React.CSSProperties = {
    fontSize: '16px',
    margin: '6px 0 0',
    color: colors.wallColor,
  };

  const variantSubtitleStyle: React.CSSProperties = {
    fontSize: '13px',
    margin: '4px 0 0',
    color: colors.wallColor,
    fontStyle: 'italic',
  };

  // Both boxes share these dimensions so they read as siblings.
  const boxStyle: React.CSSProperties = {
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '12px',
    padding: '14px',
    marginBottom: '14px',
    boxShadow: `inset 0 0 0 2px ${colors.uiAccentColor}, 0 8px 24px rgba(0, 0, 0, 0.25)`,
  };

  const certificateBoxStyle: React.CSSProperties = {
    ...boxStyle,
    position: 'relative',
  };

  const thumbnailStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '280px',
    aspectRatio: '1 / 1',
    margin: '0 auto',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  };

  const stampStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '-14px',
    right: '-10px',
    backgroundColor: colors.goalColor,
    color: pickTextColor(colors.goalColor),
    borderRadius: '50%',
    width: '78px',
    height: '78px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    boxShadow: `0 4px 14px rgba(0, 0, 0, 0.35), 0 0 0 3px ${colors.pathColor}, 0 0 0 5px ${colors.goalColor}`,
    transform: 'rotate(-8deg)',
    border: 'none',
    lineHeight: 1,
  };

  const stampNumStyle: React.CSSProperties = {
    fontSize: '28px',
    color: pickTextColor(colors.goalColor),
  };

  const stampLabelStyle: React.CSSProperties = {
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    color: pickTextColor(colors.goalColor),
    marginTop: '2px',
  };

  const proofBoxInnerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: '14px',
    alignItems: 'stretch',
  };

  const proofColumnStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flex: '0 0 auto',
  };

  const helperTextStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#e6e6e6',
    minHeight: '16px',
    textAlign: 'center',
    fontWeight: 500,
  };

  const buttonColumnStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  };

  const baseActionButtonStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '15px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.22)',
    fontFamily: 'inherit',
    minHeight: '44px',
    width: '100%',
  };

  const mintButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.uiAccentColor,
    color: pickTextColor(colors.uiAccentColor),
    fontSize: '16px',
  };

  const collectionButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.keyColor,
    color: pickTextColor(colors.keyColor),
  };

  const newGameButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.wallColor,
    color: pickTextColor(colors.wallColor),
  };

  const shareButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.goalColor,
    color: pickTextColor(colors.goalColor),
  };

  const reasonTextStyle: React.CSSProperties = {
    fontSize: '11px',
    color: pickTextColor(colors.textBackgroundColor),
    lineHeight: 1.3,
    marginTop: '-4px',
    paddingLeft: '4px',
  };

  const errorBannerStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
    border: '1px solid rgba(255, 80, 80, 0.6)',
    borderRadius: '6px',
    padding: '8px 10px',
    color: '#ff8080',
    fontSize: '12px',
    marginTop: '4px',
  };

  const proofImageSize = 140;

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(40px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes kingEntrance {
            from { opacity: 0; transform: scale(0.85); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes proofPulse {
            0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
            40%  { opacity: 0.9; }
            100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
          }
          @keyframes proofScan {
            0%   { transform: translateY(0); }
            100% { transform: translateY(${proofImageSize}px); }
          }
          .win-king-hero {
            animation: kingEntrance 250ms ease-out both;
            transform-origin: center bottom;
          }
          .win-hero-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 16px;
            margin: 0 0 14px;
          }
          @media (max-width: 540px) {
            .win-hero-row {
              flex-direction: column;
              text-align: center;
              gap: 8px;
            }
            .win-proof-row {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .win-proof-column {
              align-self: center;
            }
          }
          @keyframes stampIn {
            0%   { transform: rotate(20deg) scale(2); opacity: 0; }
            60%  { transform: rotate(-12deg) scale(0.92); opacity: 1; }
            100% { transform: rotate(-8deg) scale(1); opacity: 1; }
          }
          .win-stamp {
            animation: stampIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
          }
          .win-action-button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 14px rgba(0, 0, 0, 0.28);
          }
          .win-action-button:active:not(:disabled) {
            transform: translateY(0);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          }
          .win-action-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            transform: none;
          }
          @media (prefers-reduced-motion: reduce) {
            .win-modal,
            .win-king-hero,
            .win-stamp,
            [data-testid="proof-placeholder"] > * {
              animation: none !important;
            }
          }
        `}
      </style>
      <ConfettiCanvas colors={colors} active={isOpen} />
      <div style={overlayStyle}>
        <div
          className="win-modal"
          style={modalStyle}
          role="dialog"
          aria-labelledby="win-title"
          aria-modal="true"
        >
          {/* Hero */}
          <div className="win-hero-row">
            <img
              className="win-king-hero"
              src={kingUrl}
              alt=""
              aria-hidden="true"
              style={kingHeroStyle}
            />
            <div style={heroTextStyle}>
              <h2 id="win-title" style={titleStyle}>
                Coronation!
              </h2>
              <p style={heroSubtitleStyle}>
                This KaZtle is yours, and you can prove it!
              </p>
              <p style={variantSubtitleStyle}>{subtitle}</p>
            </div>
          </div>

          {/* Box 1: Certificate */}
          <div style={certificateBoxStyle}>
            <div style={thumbnailStyle}>
              {thumbReady && (
                <Maze
                  maze={maze}
                  playerPos={goalPos}
                  robePos={null}
                  scepterPos={null}
                  goalPos={goalPos}
                  hasRobe={true}
                  hasScepter={true}
                  colors={colors}
                  zoom={1}
                  visited={visited}
                  showEntities={true}
                  enableTouchTransform={false}
                  playerWearsCrown={true}
                  crownTier={crownTier}
                />
              )}
            </div>
            <div
              className="win-stamp"
              style={stampStyle}
              aria-label={`Solved in ${moveCount} moves`}
            >
              <span style={stampNumStyle}>{moveCount}</span>
              <span style={stampLabelStyle}>moves</span>
            </div>
          </div>

          {/* Box 2: Proof + Actions */}
          <div style={boxStyle} data-testid="proof-actions-box">
            <div className="win-proof-row" style={proofBoxInnerStyle}>
              <div className="win-proof-column" style={proofColumnStyle}>
                {proofReady && proofState.imageDataUrl && proofState.proof ? (
                  <ProofImage
                    imageDataUrl={proofState.imageDataUrl}
                    proofSizeBytes={proofState.proof.length}
                    colors={colors}
                  />
                ) : (
                  <>
                    <ProofPlaceholder
                      size={proofImageSize}
                      accentColor={colors.uiAccentColor}
                    />
                    <div style={helperTextStyle} aria-live="polite">
                      {proofState.stage === 'error'
                        ? 'Proof generation failed.'
                        : stageHelperText(proofState.stage)}
                    </div>
                  </>
                )}
              </div>

              <div style={buttonColumnStyle}>
                <button
                  className="win-action-button"
                  style={mintButtonStyle}
                  onClick={handleMint}
                  disabled={mintDisabled}
                  aria-label={mintLabel}
                  data-testid="mint-button"
                >
                  {mintLabel}
                </button>
                {mintDisabledReason && (
                  <div style={reasonTextStyle}>{mintDisabledReason}</div>
                )}
                {!mockMode && isConnected && address && (
                  <div
                    style={{
                      ...reasonTextStyle,
                      opacity: 0.85,
                    }}
                  >
                    {address.slice(0, 6)}…{address.slice(-4)}
                    {chain?.name ? ` · ${chain.name}` : ''}
                  </div>
                )}
                {mintErrorMessage && !mockMode && (
                  <div role="alert" style={errorBannerStyle}>
                    {mintErrorMessage}
                  </div>
                )}
                {proofState.stage === 'error' && !mockMode && (
                  <div role="alert" style={errorBannerStyle}>
                    {proofState.error ?? 'Proof generation failed.'}
                    <button
                      className="win-action-button"
                      style={{
                        ...newGameButtonStyle,
                        marginTop: '6px',
                        fontSize: '12px',
                        padding: '6px 10px',
                        minHeight: '32px',
                      }}
                      onClick={() => {
                        resetProof();
                        void startProofGeneration();
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}

                <button
                  className="win-action-button"
                  style={collectionButtonStyle}
                  onClick={onViewCollection}
                  aria-label="View your maze collection"
                  data-testid="collection-button"
                >
                  Collection
                </button>
                <button
                  className="win-action-button"
                  style={newGameButtonStyle}
                  onClick={handleNewMaze}
                  aria-label="Start a new game"
                  data-testid="new-game-button"
                >
                  New Game
                </button>
                <button
                  className="win-action-button"
                  style={shareButtonStyle}
                  onClick={onCopyLink}
                  aria-label="Share this maze"
                  data-testid="share-button"
                >
                  {copied ? 'Link Copied!' : 'Share Maze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
