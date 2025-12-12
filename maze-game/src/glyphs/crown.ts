/**
 * Draws a royal crown glyph (player icon)
 */
export function drawCrown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  ctx.translate(x, y);

  // Shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const goldMain = '#FFD700';
  const goldDark = '#B8860B';
  const goldLight = '#FFF8DC';
  const outline = '#4a3000';
  const gemRed = '#DC143C';

  // Crown dimensions - wider and bolder
  const baseWidth = size * 0.9;
  const baseHeight = size * 0.2;
  const baseY = size * 0.15;
  const crownHeight = size * 0.5;

  // Draw crown body with 3 bold points (simpler, more readable)
  ctx.beginPath();
  ctx.moveTo(-baseWidth / 2, baseY);
  // Left point
  ctx.lineTo(-baseWidth * 0.35, baseY - crownHeight * 0.7);
  // Left valley
  ctx.lineTo(-baseWidth * 0.17, baseY - crownHeight * 0.3);
  // Center point (tallest)
  ctx.lineTo(0, baseY - crownHeight);
  // Right valley
  ctx.lineTo(baseWidth * 0.17, baseY - crownHeight * 0.3);
  // Right point
  ctx.lineTo(baseWidth * 0.35, baseY - crownHeight * 0.7);
  ctx.lineTo(baseWidth / 2, baseY);
  ctx.closePath();

  // Crown outline - thicker for visibility
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Crown fill with gradient
  const crownGrad = ctx.createLinearGradient(0, baseY - crownHeight, 0, baseY);
  crownGrad.addColorStop(0, goldLight);
  crownGrad.addColorStop(0.4, goldMain);
  crownGrad.addColorStop(1, goldDark);
  ctx.fillStyle = crownGrad;
  ctx.fill();

  // Base band outline and fill
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-baseWidth / 2, baseY, baseWidth, baseHeight, 3);
  ctx.stroke();

  const baseGrad = ctx.createLinearGradient(-baseWidth / 2, baseY, baseWidth / 2, baseY);
  baseGrad.addColorStop(0, goldDark);
  baseGrad.addColorStop(0.3, goldMain);
  baseGrad.addColorStop(0.5, goldLight);
  baseGrad.addColorStop(0.7, goldMain);
  baseGrad.addColorStop(1, goldDark);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Large center gem (ruby) - more visible
  const gemSize = size * 0.1;
  ctx.fillStyle = gemRed;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, baseY - crownHeight + gemSize * 2, gemSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Gem highlight
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-gemSize * 0.3, baseY - crownHeight + gemSize * 1.7, gemSize * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Base band center gem
  ctx.fillStyle = gemRed;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, baseY + baseHeight / 2, gemSize * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
