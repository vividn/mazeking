import React, { useEffect, useRef, useState } from 'react';
import type { ColorScheme } from '../types';

interface ProofImageProps {
  imageDataUrl: string;
  proofSizeBytes: number;
  colors: ColorScheme;
  /**
   * Reveal progress 0..1. If omitted, the component animates 0→1 internally
   * on the first render with a given imageDataUrl ("instant Polaroid develop").
   */
  progress?: number;
}

const REVEAL_DURATION_MS = 1500;
const RENDER_SIZE = 128;

export function ProofImage({
  imageDataUrl,
  proofSizeBytes,
  colors,
  progress,
}: ProofImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalProgress, setInternalProgress] = useState(0);
  const externallyDriven = typeof progress === 'number';
  const reveal = externallyDriven
    ? Math.max(0, Math.min(1, progress!))
    : internalProgress;

  // Internal develop animation when no external progress is supplied.
  useEffect(() => {
    if (externallyDriven) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setInternalProgress(1);
      return;
    }

    setInternalProgress(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_DURATION_MS);
      setInternalProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [imageDataUrl, externallyDriven]);

  // Paint the proof image into a canvas, revealing only the top `reveal`
  // fraction of rows — a row-by-row Polaroid develop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = RENDER_SIZE * dpr;
    canvas.height = RENDER_SIZE * dpr;
    canvas.style.width = `${RENDER_SIZE}px`;
    canvas.style.height = `${RENDER_SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
      // Undeveloped rows: warm Polaroid film tint.
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);

      const revealedRows = Math.max(
        0,
        Math.min(RENDER_SIZE, Math.round(reveal * RENDER_SIZE))
      );
      if (revealedRows > 0) {
        // Draw only the top `revealedRows` of the source.
        const srcRows = Math.round((revealedRows / RENDER_SIZE) * img.height);
        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          srcRows,
          0,
          0,
          RENDER_SIZE,
          revealedRows
        );
      }

      // Scan-line glow on the developing edge.
      if (reveal > 0 && reveal < 1) {
        const y = revealedRows;
        const grad = ctx.createLinearGradient(0, y - 8, 0, y + 2);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(255,255,255,0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, Math.max(0, y - 8), RENDER_SIZE, 10);
      }
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, reveal]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '8px',
  };

  // Mid-develop blur lifts as the picture resolves.
  const blurPx = (1 - reveal) * 3;
  const sat = 0.4 + 0.6 * reveal;
  const canvasStyle: React.CSSProperties = {
    width: `${RENDER_SIZE}px`,
    height: `${RENDER_SIZE}px`,
    imageRendering: 'pixelated',
    border: `3px solid ${colors.uiAccentColor}`,
    borderRadius: '8px',
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`,
    filter: `blur(${blurPx.toFixed(2)}px) saturate(${sat.toFixed(2)})`,
    transition: 'filter 80ms linear',
  };

  const captionStyle: React.CSSProperties = {
    fontSize: '13px',
    color: colors.wallColor,
    textAlign: 'center',
  };

  const proofSizeStyle: React.CSSProperties = {
    fontWeight: 'bold',
    color: colors.goalColor,
  };

  const successBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: colors.keyColor,
    color: '#000',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 'bold',
    opacity: reveal >= 0.999 ? 1 : 0.6,
    transition: 'opacity 200ms ease',
  };

  return (
    <div style={containerStyle}>
      <div style={successBadgeStyle}>
        <span>{reveal >= 0.999 ? 'Proof Generated' : 'Developing…'}</span>
      </div>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        aria-label="ZK Proof visualization - proof bytes encoded as RGB pixels"
        role="img"
      />
      <div style={captionStyle}>
        <span style={proofSizeStyle}>{proofSizeBytes.toLocaleString()}</span>{' '}
        bytes
      </div>
    </div>
  );
}
