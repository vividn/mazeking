import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { type MazeData, type Position, type ColorScheme } from '../types';
import { CrownTier } from '../lib/spriteGlyphs';
import { MazeCanvas } from './MazeCanvas';

export interface MazeProps {
  maze: MazeData;
  playerPos: Position;
  /** Robe pickup position. `null` once collected (or never present). */
  robePos: Position | null;
  /** Scepter pickup position. `null` once collected (or never present). */
  scepterPos: Position | null;
  goalPos: Position;
  hasRobe: boolean;
  hasScepter: boolean;
  colors: ColorScheme;
  zoom: number;
  visited: Set<string>;
  showEntities?: boolean;
  /** Enable pinch-to-zoom and 1-finger pan via touch events (mobile). */
  enableTouchTransform?: boolean;
  /** Enable mouse-wheel zoom and click-drag pan (desktop). */
  enableMouseTransform?: boolean;
  /**
   * Render the player wearing the crown — reserved for the win moment
   * (WinModal thumbnail). Takes precedence over the regalia silhouette.
   */
  playerWearsCrown?: boolean;
  /**
   * Tier variant for the worn crown. Only used when `playerWearsCrown` is
   * true. Defaults to Plain (the un-tiered registered-solve crown).
   */
  crownTier?: CrownTier;
  /**
   * When true, render the regalia hint speech bubble above the player. Shown
   * when the player reaches the goal without full regalia.
   */
  showKinglyHint?: boolean;
}

const MAX_USER_ZOOM = 6;
const DOUBLE_TAP_MS = 300;
const MOUSE_DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_STEP = 1.15;
const RESET_ANIM_MS = 150;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MazeHandle {
  /** Snap (or animate) back to fit-to-viewport, centered. */
  resetView: () => void;
}

/**
 * Interactive viewport wrapper around MazeCanvas. Owns the user-applied
 * pinch/pan/wheel transform state and the gesture handlers, and forwards a
 * MazeHandle ref exposing `resetView`. Delegates all rendering to MazeCanvas.
 */
export const MazeViewport = forwardRef<MazeHandle, MazeProps>(
  function MazeViewport(
    {
      maze,
      playerPos,
      robePos,
      scepterPos,
      goalPos,
      hasRobe,
      hasScepter,
      colors,
      zoom,
      visited,
      showEntities = true,
      enableTouchTransform = false,
      enableMouseTransform = false,
      playerWearsCrown = false,
      crownTier = CrownTier.Plain,
      showKinglyHint = false,
    },
    ref
  ) {
    // Lower bound such that the maze never shrinks past fit-to-viewport.
    // baseCellSize = min(viewport/maze) which is the exact-fit cell size at
    // totalZoom=1. So minUserZoom = 1 / zoom keeps totalZoom >= 1.
    const minUserZoom = 1 / zoom;
    const containerRef = useRef<HTMLDivElement>(null);

    // Per-user transform applied on top of the base centering / zoom prop.
    const [userZoom, setUserZoom] = useState(1);
    const [userPan, setUserPan] = useState({ x: 0, y: 0 });
    const lastTapRef = useRef<number>(0);

    // Reset user transform when the maze identity changes
    const mazeKey = `${maze.width}x${maze.height}`;
    const lastMazeKeyRef = useRef(mazeKey);
    useEffect(() => {
      if (lastMazeKeyRef.current !== mazeKey) {
        lastMazeKeyRef.current = mazeKey;
        setUserZoom(minUserZoom);
        setUserPan({ x: 0, y: 0 });
      }
    }, [mazeKey, minUserZoom]);

    // Touch gesture handling: 1-finger pan, 2-finger pinch zoom, double-tap to reset
    const gestureRef = useRef<{
      mode: 'pan' | 'pinch' | null;
      last?: { x: number; y: number };
      startDist?: number;
      startTotalZoom?: number;
      startUserZoom?: number;
      startMid?: { x: number; y: number };
      startOffset?: { x: number; y: number };
      startPan?: { x: number; y: number };
      centerOffsetFn?: (z: number) => { x: number; y: number };
    }>({ mode: null });

    const computeNeutralOffset = useCallback(
      (totalZoom: number) => {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        const baseCellSize = Math.min(
          rect.width / maze.width,
          rect.height / maze.height
        );
        const cellSize = baseCellSize * totalZoom;
        return {
          x: (rect.width - maze.width * cellSize) / 2,
          y: (rect.height - maze.height * cellSize) / 2,
        };
      },
      [maze.width, maze.height]
    );

    // Clamp pan so the maze image cannot be dragged past where its outer edge
    // meets the viewport edge — the player should never see void around the maze.
    // When the maze fits inside the viewport in a dimension, lock pan to 0
    // (centered) on that axis.
    const clampPan = useCallback(
      (pan: { x: number; y: number }, totalZoom: number) => {
        const container = containerRef.current;
        if (!container) return pan;
        const rect = container.getBoundingClientRect();
        const baseCellSize = Math.min(
          rect.width / maze.width,
          rect.height / maze.height
        );
        const cellSize = baseCellSize * totalZoom;
        const excessX = Math.max(0, maze.width * cellSize - rect.width);
        const excessY = Math.max(0, maze.height * cellSize - rect.height);
        return {
          x: clamp(pan.x, -excessX / 2, excessX / 2),
          y: clamp(pan.y, -excessY / 2, excessY / 2),
        };
      },
      [maze.width, maze.height]
    );

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (!enableTouchTransform) return;
        if (e.touches.length === 1) {
          const t = e.touches[0];
          const now = Date.now();
          // Double-tap to reset transform
          if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            setUserZoom(minUserZoom);
            setUserPan({ x: 0, y: 0 });
            lastTapRef.current = 0;
            gestureRef.current = { mode: null };
            return;
          }
          lastTapRef.current = now;
          gestureRef.current = {
            mode: 'pan',
            last: { x: t.clientX, y: t.clientY },
          };
        } else if (e.touches.length === 2) {
          const container = containerRef.current;
          const rect = container?.getBoundingClientRect();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dx = t2.clientX - t1.clientX;
          const dy = t2.clientY - t1.clientY;
          const dist = Math.hypot(dx, dy);
          const midScreenX = (t1.clientX + t2.clientX) / 2;
          const midScreenY = (t1.clientY + t2.clientY) / 2;
          // Convert mid to canvas-local coords
          const midX = rect ? midScreenX - rect.left : midScreenX;
          const midY = rect ? midScreenY - rect.top : midScreenY;

          const startTotalZoom = zoom * userZoom;
          const neutral = computeNeutralOffset(startTotalZoom);
          const startOffsetX = neutral.x + userPan.x;
          const startOffsetY = neutral.y + userPan.y;

          gestureRef.current = {
            mode: 'pinch',
            startDist: dist,
            startTotalZoom,
            startUserZoom: userZoom,
            startMid: { x: midX, y: midY },
            startOffset: { x: startOffsetX, y: startOffsetY },
            startPan: { ...userPan },
          };
        }
      },
      [
        enableTouchTransform,
        zoom,
        userZoom,
        userPan,
        minUserZoom,
        computeNeutralOffset,
      ]
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (!enableTouchTransform) return;
        const g = gestureRef.current;
        if (g.mode === 'pan' && e.touches.length === 1 && g.last) {
          const t = e.touches[0];
          const dx = t.clientX - g.last.x;
          const dy = t.clientY - g.last.y;
          g.last = { x: t.clientX, y: t.clientY };
          const totalZoom = zoom * userZoom;
          setUserPan((prev) =>
            clampPan({ x: prev.x + dx, y: prev.y + dy }, totalZoom)
          );
          e.preventDefault();
        } else if (
          g.mode === 'pinch' &&
          e.touches.length === 2 &&
          g.startDist &&
          g.startUserZoom !== undefined &&
          g.startMid &&
          g.startOffset &&
          g.startTotalZoom !== undefined
        ) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dx = t2.clientX - t1.clientX;
          const dy = t2.clientY - t1.clientY;
          const dist = Math.hypot(dx, dy);
          const ratio = dist / g.startDist;
          const newUserZoom = clamp(
            g.startUserZoom * ratio,
            minUserZoom,
            MAX_USER_ZOOM
          );
          setUserZoom(newUserZoom);
          if (newUserZoom <= minUserZoom) {
            // At fit-to-viewport: lock the maze centered.
            setUserPan({ x: 0, y: 0 });
          } else {
            // Effective applied ratio after clamping
            const k = (zoom * newUserZoom) / g.startTotalZoom;
            // New offset that anchors midpoint
            const newOffsetX =
              g.startMid.x - (g.startMid.x - g.startOffset.x) * k;
            const newOffsetY =
              g.startMid.y - (g.startMid.y - g.startOffset.y) * k;
            // Convert back to userPan: newPan = newOffset - centerOffset(newTotalZoom)
            const neutral = computeNeutralOffset(zoom * newUserZoom);
            setUserPan(
              clampPan(
                { x: newOffsetX - neutral.x, y: newOffsetY - neutral.y },
                zoom * newUserZoom
              )
            );
          }
          e.preventDefault();
        }
      },
      [
        enableTouchTransform,
        zoom,
        userZoom,
        minUserZoom,
        computeNeutralOffset,
        clampPan,
      ]
    );

    const handleTouchEnd = useCallback(
      (e: React.TouchEvent) => {
        if (!enableTouchTransform) return;
        if (e.touches.length === 0) {
          gestureRef.current = { mode: null };
        } else if (
          e.touches.length === 1 &&
          gestureRef.current.mode === 'pinch'
        ) {
          // Switch to pan with the remaining finger
          const t = e.touches[0];
          gestureRef.current = {
            mode: 'pan',
            last: { x: t.clientX, y: t.clientY },
          };
        }
      },
      [enableTouchTransform]
    );

    // Animated reset back to fit-to-viewport, centered. Snaps under
    // prefers-reduced-motion. Cancels any in-flight reset via a generation token.
    const resetAnimRef = useRef(0);
    const resetView = useCallback(() => {
      const targetZoom = minUserZoom;
      const targetPan = { x: 0, y: 0 };
      resetAnimRef.current += 1;
      const myGen = resetAnimRef.current;

      if (prefersReducedMotion()) {
        setUserZoom(targetZoom);
        setUserPan(targetPan);
        return;
      }

      const fromZoom = userZoom;
      const fromPan = userPan;
      if (fromZoom === targetZoom && fromPan.x === 0 && fromPan.y === 0) return;

      const start = performance.now();
      const ease = (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const step = (now: number) => {
        if (resetAnimRef.current !== myGen) return; // superseded
        const t = Math.min(1, (now - start) / RESET_ANIM_MS);
        const k = ease(t);
        setUserZoom(fromZoom + (targetZoom - fromZoom) * k);
        setUserPan({
          x: fromPan.x + (targetPan.x - fromPan.x) * k,
          y: fromPan.y + (targetPan.y - fromPan.y) * k,
        });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, [minUserZoom, userZoom, userPan]);

    useImperativeHandle(ref, () => ({ resetView }), [resetView]);

    // Mouse drag pan: a small threshold prevents an accidental click from
    // counting as a pan; once exceeded, deltas update userPan directly.
    const mouseDragRef = useRef<{
      startX: number;
      startY: number;
      startPan: { x: number; y: number };
      isDragging: boolean;
    } | null>(null);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (!enableMouseTransform) return;
        // Middle-click: reset transform to fit-to-viewport. Don't start a drag.
        if (e.button === 1) {
          e.preventDefault();
          resetView();
          return;
        }
        if (e.button !== 0) return;
        mouseDragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startPan: userPan,
          isDragging: false,
        };
      },
      [enableMouseTransform, userPan, resetView]
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        const drag = mouseDragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.isDragging) {
          if (Math.hypot(dx, dy) < MOUSE_DRAG_THRESHOLD_PX) return;
          drag.isDragging = true;
        }
        setUserPan(
          clampPan(
            { x: drag.startPan.x + dx, y: drag.startPan.y + dy },
            zoom * userZoom
          )
        );
      },
      [zoom, userZoom, clampPan]
    );

    const handleMouseUp = useCallback(() => {
      mouseDragRef.current = null;
    }, []);

    // Wheel handler is attached via addEventListener so we can opt out of the
    // passive default and call preventDefault — keeps the page from scrolling
    // while the user wheels-zooms over the maze.
    useEffect(() => {
      if (!enableMouseTransform) return;
      const container = containerRef.current;
      if (!container) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const startTotalZoom = zoom * userZoom;
        const neutral = computeNeutralOffset(startTotalZoom);
        const startOffsetX = neutral.x + userPan.x;
        const startOffsetY = neutral.y + userPan.y;

        const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
        const newUserZoom = clamp(
          userZoom * factor,
          minUserZoom,
          MAX_USER_ZOOM
        );
        if (newUserZoom === userZoom) return;

        setUserZoom(newUserZoom);
        if (newUserZoom <= minUserZoom) {
          // At fit-to-viewport: lock centered, no panning makes sense.
          setUserPan({ x: 0, y: 0 });
          return;
        }
        const k = (zoom * newUserZoom) / startTotalZoom;
        const newOffsetX = cursorX - (cursorX - startOffsetX) * k;
        const newOffsetY = cursorY - (cursorY - startOffsetY) * k;
        const newNeutral = computeNeutralOffset(zoom * newUserZoom);
        setUserPan(
          clampPan(
            { x: newOffsetX - newNeutral.x, y: newOffsetY - newNeutral.y },
            zoom * newUserZoom
          )
        );
      };
      container.addEventListener('wheel', onWheel, { passive: false });
      return () => container.removeEventListener('wheel', onWheel);
    }, [
      enableMouseTransform,
      zoom,
      userZoom,
      userPan,
      minUserZoom,
      computeNeutralOffset,
      clampPan,
    ]);

    return (
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          overflow: 'hidden',
          position: 'relative',
          touchAction: enableTouchTransform ? 'none' : 'auto',
          cursor: enableMouseTransform ? 'grab' : 'default',
        }}
      >
        <MazeCanvas
          maze={maze}
          playerPos={playerPos}
          robePos={robePos}
          scepterPos={scepterPos}
          goalPos={goalPos}
          hasRobe={hasRobe}
          hasScepter={hasScepter}
          colors={colors}
          zoom={zoom}
          visited={visited}
          showEntities={showEntities}
          playerWearsCrown={playerWearsCrown}
          crownTier={crownTier}
          showKinglyHint={showKinglyHint}
          userZoom={userZoom}
          userPan={userPan}
          containerRef={containerRef}
        />
      </div>
    );
  }
);
