import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorScheme, MazeData, Move, Position } from '../types';
import { useZkProof } from '../hooks/useZkProof';
import { Maze } from './Maze';
import { MintBlock } from './MintBlock';
import { NavBlock } from './NavBlock';
import { ShareBlock } from './ShareBlock';
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

  const handleNewMaze = () => {
    resetProof();
    onNewMaze();
  };

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

  const certificateBoxStyle: React.CSSProperties = {
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '12px',
    padding: '14px',
    marginBottom: '14px',
    boxShadow: `inset 0 0 0 2px ${colors.uiAccentColor}, 0 8px 24px rgba(0, 0, 0, 0.25)`,
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
          @keyframes proofRoyalBreath {
            0%, 100% { opacity: 0.30; transform: scale(1); }
            50%      { opacity: 0.60; transform: scale(1.04); }
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
          <MintBlock
            colors={colors}
            moveCount={moveCount}
            proofState={proofState}
            startProofGeneration={startProofGeneration}
            resetProof={resetProof}
            mockMode={mockMode}
          >
            <NavBlock
              colors={colors}
              onViewCollection={onViewCollection}
              onNewMaze={handleNewMaze}
            />
            <ShareBlock
              colors={colors}
              copied={copied}
              onCopyLink={onCopyLink}
            />
          </MintBlock>
        </div>
      </div>
    </>
  );
}
