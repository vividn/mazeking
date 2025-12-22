/**
 * Draws an ornate key glyph
 */
export function drawKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4); // Rotate 45 degrees for dynamic look

  // Shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const goldMain = '#FFD700';
  const goldDark = '#B8860B';
  const goldLight = '#FFF8DC';
  const outline = '#4a3000';

  // Key shaft (the long part)
  const shaftLength = size * 0.55;
  const shaftWidth = size * 0.12;

  // Draw outline first (slightly larger)
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft outline
  ctx.beginPath();
  ctx.roundRect(-shaftWidth / 2, -size * 0.1, shaftWidth, shaftLength, 2);
  ctx.stroke();

  // Shaft fill with gradient
  const shaftGrad = ctx.createLinearGradient(-shaftWidth / 2, 0, shaftWidth / 2, 0);
  shaftGrad.addColorStop(0, goldDark);
  shaftGrad.addColorStop(0.3, goldMain);
  shaftGrad.addColorStop(0.5, goldLight);
  shaftGrad.addColorStop(0.7, goldMain);
  shaftGrad.addColorStop(1, goldDark);
  ctx.fillStyle = shaftGrad;
  ctx.beginPath();
  ctx.roundRect(-shaftWidth / 2, -size * 0.1, shaftWidth, shaftLength, 2);
  ctx.fill();

  // Key bow (the decorative round part at top)
  const bowRadius = size * 0.22;
  const bowY = -size * 0.1 - bowRadius * 0.7;

  // Bow outline
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, bowY, bowRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Bow fill with gradient
  const bowGrad = ctx.createRadialGradient(
    -bowRadius * 0.3, bowY - bowRadius * 0.3, 0,
    0, bowY, bowRadius
  );
  bowGrad.addColorStop(0, goldLight);
  bowGrad.addColorStop(0.4, goldMain);
  bowGrad.addColorStop(1, goldDark);
  ctx.fillStyle = bowGrad;
  ctx.beginPath();
  ctx.arc(0, bowY, bowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner hole in bow (decorative)
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, bowY, bowRadius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Key teeth (the bits at the end)
  const teethY = -size * 0.1 + shaftLength;
  const toothWidth = size * 0.08;
  const toothHeight = size * 0.12;

  // Tooth 1 (left)
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-shaftWidth / 2 - toothWidth, teethY - toothHeight, toothWidth, toothHeight);
  ctx.stroke();
  ctx.fillStyle = goldMain;
  ctx.fill();

  // Tooth 2 (bottom left)
  ctx.beginPath();
  ctx.rect(-shaftWidth / 2 - toothWidth * 0.7, teethY - toothHeight * 0.5, toothWidth * 0.7, toothHeight * 0.5);
  ctx.stroke();
  ctx.fillStyle = goldDark;
  ctx.fill();

  // Notch in shaft (decorative detail)
  ctx.fillStyle = goldDark;
  ctx.fillRect(-shaftWidth / 2, teethY - toothHeight * 1.8, shaftWidth, size * 0.04);

  // Highlight line on shaft
  ctx.strokeStyle = goldLight;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.05);
  ctx.lineTo(0, teethY - toothHeight * 2);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
