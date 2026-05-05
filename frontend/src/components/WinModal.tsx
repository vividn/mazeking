import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import type { ColorScheme, MazeData, Move, Position } from '../types';
import { useZkProof } from '../hooks/useZkProof';
import { useMintNFT } from '../hooks/useMintNFT';
import { ProofProgress } from './ProofProgress';
import { ProofImage } from './ProofImage';
import { Maze } from './Maze';
import { areContractsDeployed } from '../lib/contracts';
import { sepolia } from 'wagmi/chains';
import { computeTokenIdFromMazeHash } from '../lib/tokenId';
import { rememberMint } from '../lib/mintRegistry';
import { computeOptimalMoves, tierFromMoveCount } from '../lib/mazeSolver';
import { pickTextColor } from '../lib/contrastText';
import kingUrl from '../glyphs/king.png?url';

interface WinModalProps {
  isOpen: boolean;
  moveCount: number;
  seed: string;
  onPlayAgain: () => void;
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

export function WinModal({
  isOpen,
  moveCount,
  seed,
  onPlayAgain,
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
}: WinModalProps) {
  const {
    state: proofState,
    startProofGeneration,
    reset: resetProof,
  } = useZkProof(maze, moves, startPos, robePos, scepterPos, goalPos);

  // Crown tier preview — computed locally from the same thresholds the
  // on-chain DefaultBadgeAwarder uses, so the player sees what they earned
  // immediately. Memoized on maze identity to avoid resolving BFS each render.
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
  useDisconnect();
  const { switchChain } = useSwitchChain();

  // NFT minting
  const {
    mintWithProof,
    isPending,
    isConfirming,
    isSuccess,
    errorMessage: mintErrorMessage,
  } = useMintNFT();

  // On successful mint, persist tokenId↔seed locally so the My Mazes view can
  // replay this maze even though the contract derives tokenId from the layout
  // rather than from the seed string. Under the hash-as-public-input
  // architecture (ma-6cr.6) the tokenId IS the mazeHash, which is the proof's
  // first public input.
  useEffect(() => {
    if (!isSuccess || !proofState.publicInputs?.length) return;
    try {
      const tokenId = computeTokenIdFromMazeHash(proofState.publicInputs[0]);
      rememberMint(tokenId, seed);
    } catch (err) {
      console.warn('Failed to record mint→seed mapping:', err);
    }
  }, [isSuccess, proofState.publicInputs, seed]);

  // Check if contracts are deployed on current chain
  const contractsDeployed = chain ? areContractsDeployed(chain.id) : false;

  const handleMint = async () => {
    if (!proofState.proof || !proofState.mazeHash || !proofState.layoutBytes) {
      console.error('No proof available to mint');
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
      // wagmi surfaces the underlying error via `mintError`; logging here
      // keeps the dev console legible during local play.
      console.error('mintWithProof threw:', err);
    }
  };

  const handlePlayAgain = () => {
    resetProof();
    onPlayAgain();
  };

  const handleNewMaze = () => {
    resetProof();
    onNewMaze();
  };

  const isProving =
    proofState.stage !== 'idle' &&
    proofState.stage !== 'complete' &&
    proofState.stage !== 'error';

  // Escape: replay the same maze (the primary action). Skip while proving so
  // we don't tear down the in-flight ZK pipeline mid-keypress.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProving) {
        e.preventDefault();
        resetProof();
        onPlayAgain();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isProving, resetProof, onPlayAgain]);

  if (!isOpen) return null;

  const subtitle = getSubtitleVariant(moveCount, maze);

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
    padding: '22px 28px',
    maxWidth: '640px',
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
    opacity: 0.9,
  };

  const variantSubtitleStyle: React.CSSProperties = {
    fontSize: '13px',
    margin: '6px 0 0',
    color: colors.wallColor,
    opacity: 0.7,
    fontStyle: 'italic',
  };

  const certificateFrameStyle: React.CSSProperties = {
    position: 'relative',
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '12px',
    padding: '8px',
    marginBottom: '14px',
    boxShadow: `inset 0 0 0 2px ${colors.uiAccentColor}, 0 8px 24px rgba(0, 0, 0, 0.25)`,
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
    color: colors.pathColor,
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
    color: colors.pathColor,
  };

  const stampLabelStyle: React.CSSProperties = {
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    color: colors.pathColor,
    opacity: 0.85,
    marginTop: '2px',
  };

  const zkSectionStyle: React.CSSProperties = {
    marginBottom: '14px',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '10px',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  };

  const baseButtonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    fontFamily: 'inherit',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: colors.uiAccentColor,
    color: pickTextColor(colors.uiAccentColor),
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: colors.wallColor,
    color: pickTextColor(colors.wallColor),
  };

  const shareButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: 'transparent',
    color: colors.uiAccentColor,
    border: `2px solid ${colors.uiAccentColor}`,
    boxShadow: 'none',
  };

  const zkButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: colors.keyColor,
    color: pickTextColor(colors.keyColor),
  };

  const errorStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    border: '1px solid rgba(255, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    color: '#ff6b6b',
    fontSize: '14px',
    textAlign: 'center',
  };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(40px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes kingEntrance {
            from {
              opacity: 0;
              transform: scale(0.85);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
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
            margin: 0 0 16px;
          }

          @media (max-width: 480px) {
            .win-hero-row {
              flex-direction: column;
              text-align: center;
              gap: 8px;
            }
            .win-button-row {
              flex-direction: column !important;
            }
            .win-button-row > .win-button {
              flex: 1 1 auto !important;
            }
          }

          @keyframes stampIn {
            0% { transform: rotate(20deg) scale(2); opacity: 0; }
            60% { transform: rotate(-12deg) scale(0.92); opacity: 1; }
            100% { transform: rotate(-8deg) scale(1); opacity: 1; }
          }

          .win-stamp {
            animation: stampIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
          }

          .win-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          }

          .win-button:active {
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          }

          .win-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
          }

          @media (prefers-reduced-motion: reduce) {
            .win-modal,
            .win-king-hero,
            .win-stamp {
              animation: none !important;
            }
          }
        `}
      </style>
      <ConfettiCanvas colors={colors} active={isOpen} />
      <div style={overlayStyle} onClick={(e) => e.stopPropagation()}>
        <div
          className="win-modal"
          style={modalStyle}
          role="dialog"
          aria-labelledby="win-title"
          aria-modal="true"
        >
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

          <div style={certificateFrameStyle}>
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

          <div style={zkSectionStyle}>
            {proofState.stage === 'idle' && (
              <button
                className="win-button"
                style={zkButtonStyle}
                onClick={startProofGeneration}
                aria-label="Create zero knowledge proof of your solution"
              >
                Create Zero Knowledge Proof
              </button>
            )}

            {isProving && (
              <ProofProgress
                stage={proofState.stage}
                progress={proofState.progress}
                colors={colors}
              />
            )}

            {proofState.stage === 'complete' &&
              proofState.imageDataUrl &&
              proofState.proof && (
                <>
                  <ProofImage
                    imageDataUrl={proofState.imageDataUrl}
                    proofSizeBytes={proofState.proof.length}
                    colors={colors}
                  />

                  {/* Minting section */}
                  <div style={{ marginTop: '24px' }}>
                    {!isConnected ? (
                      <button
                        className="win-button"
                        style={{
                          ...primaryButtonStyle,
                          backgroundColor: colors.goalColor,
                        }}
                        onClick={() => connect({ connector: connectors[0] })}
                        aria-label="Connect wallet to mint NFT"
                      >
                        Connect Wallet to Mint NFT
                      </button>
                    ) : !contractsDeployed ? (
                      <div style={errorStyle}>
                        Contracts not deployed on{' '}
                        {chain?.name || 'this network'}.
                        {areContractsDeployed(sepolia.id) && (
                          <button
                            className="win-button"
                            style={{
                              ...zkButtonStyle,
                              marginTop: '12px',
                              display: 'block',
                              width: '100%',
                            }}
                            onClick={() => switchChain({ chainId: sepolia.id })}
                          >
                            Switch to Sepolia
                          </button>
                        )}
                      </div>
                    ) : isSuccess ? (
                      <>
                        <div
                          style={{
                            ...errorStyle,
                            backgroundColor: 'rgba(0, 255, 0, 0.1)',
                            border: '1px solid rgba(0, 255, 0, 0.3)',
                            color: '#4ade80',
                          }}
                        >
                          ✓ NFT Minted Successfully!
                          <div
                            style={{
                              marginTop: '8px',
                              fontSize: '12px',
                              opacity: 0.8,
                            }}
                          >
                            Connected: {address?.slice(0, 6)}...
                            {address?.slice(-4)}
                          </div>
                        </div>
                        <button
                          className="win-button"
                          style={{
                            ...primaryButtonStyle,
                            backgroundColor: colors.goalColor,
                            color: pickTextColor(colors.goalColor),
                            width: '100%',
                          }}
                          onClick={onViewCollection}
                          aria-label="View your minted maze collection"
                        >
                          View Collection →
                        </button>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            marginBottom: '12px',
                            fontSize: '12px',
                            textAlign: 'center',
                            color: colors.wallColor,
                            opacity: 0.7,
                          }}
                        >
                          Connected: {address?.slice(0, 6)}...
                          {address?.slice(-4)}
                          {' • '}
                          {chain?.name}
                        </div>

                        <button
                          className="win-button"
                          style={{
                            ...primaryButtonStyle,
                            backgroundColor: colors.goalColor,
                            opacity: isPending || isConfirming ? 0.7 : 1,
                          }}
                          onClick={handleMint}
                          disabled={isPending || isConfirming}
                          aria-label="Mint achievement NFT"
                        >
                          {isPending && 'Preparing Transaction...'}
                          {isConfirming && 'Confirming on Chain...'}
                          {!isPending &&
                            !isConfirming &&
                            'Mint Achievement NFT'}
                        </button>

                        {mintErrorMessage && (
                          <div
                            role="alert"
                            style={{
                              ...errorStyle,
                              marginTop: '12px',
                              fontSize: '12px',
                            }}
                          >
                            {mintErrorMessage}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

            {proofState.stage === 'error' && (
              <div role="alert" style={errorStyle}>
                Proof generation failed: {proofState.error || 'Unknown error'}
                <button
                  className="win-button"
                  style={{ ...zkButtonStyle, marginTop: '12px' }}
                  onClick={startProofGeneration}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          <div className="win-button-row" style={buttonContainerStyle}>
            <button
              className="win-button"
              style={{
                ...primaryButtonStyle,
                flex: '2 1 220px',
                fontSize: '17px',
                padding: '14px 24px',
              }}
              onClick={handlePlayAgain}
              disabled={isProving}
              aria-label="Play the same maze again"
            >
              Play Again
            </button>

            <button
              className="win-button"
              style={{ ...secondaryButtonStyle, flex: '1 1 140px' }}
              onClick={handleNewMaze}
              disabled={isProving}
              aria-label="Generate a new maze"
            >
              New Maze
            </button>

            <button
              className="win-button"
              style={{ ...shareButtonStyle, flex: '1 1 140px' }}
              onClick={onCopyLink}
              aria-label="Share this maze"
            >
              {copied ? 'Link Copied!' : 'Share Maze'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
