/**
 * Generates a distinct color for arrow pairs based on index.
 * Uses golden ratio to distribute hues evenly.
 */
export function getArrowColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsla(${hue}, 90%, 60%, 1.0)`;
}

/**
 * Draws a small directional arrow for wraparound indicators
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'up' | 'down' | 'left' | 'right',
  color: string,
  arrowSize: number
): void {
  ctx.save();
  ctx.translate(x, y);

  // Rotate based on direction
  const rotations = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
  ctx.rotate(rotations[direction]);

  // Draw arrow pointing up (will be rotated)
  // White outer glow for visibility
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -arrowSize / 2);
  ctx.lineTo(arrowSize / 2, arrowSize / 2);
  ctx.lineTo(-arrowSize / 2, arrowSize / 2);
  ctx.closePath();
  ctx.stroke();

  // Dark inner stroke
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fill with the unique color
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a corner warp indicator (4-way star/cross shape)
 * Used where both vertical and horizontal warps exist at corners
 */
export function drawCornerWarp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vColor: string,
  hColor: string,
  arrowSize: number
): void {
  ctx.save();
  ctx.translate(x, y);
  const size = arrowSize * 0.9;

  // Draw a 4-pointed star shape with both colors
  // White outer glow
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 3;

  // Vertical arrows (up and down)
  ctx.beginPath();
  // Up arrow
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.4, -size * 0.3);
  ctx.lineTo(-size * 0.4, -size * 0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = vColor;
  ctx.fill();

  // Down arrow
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size * 0.4, size * 0.3);
  ctx.lineTo(-size * 0.4, size * 0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = vColor;
  ctx.fill();

  // Horizontal arrows (left and right)
  // Left arrow
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(-size * 0.3, size * 0.4);
  ctx.lineTo(-size * 0.3, -size * 0.4);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = hColor;
  ctx.fill();

  // Right arrow
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(size * 0.3, size * 0.4);
  ctx.lineTo(size * 0.3, -size * 0.4);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = hColor;
  ctx.fill();

  ctx.restore();
}
