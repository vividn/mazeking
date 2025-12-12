/**
 * Draws a locked treasure chest glyph (door icon)
 */
export function drawChest(
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

  const woodMain = '#8B4513';
  const woodDark = '#5D2E0C';
  const woodLight = '#A0522D';
  const metalDark = '#2a2a2a';
  const metalLight = '#5a5a5a';
  const outline = '#1a0a00';

  // Chest body dimensions
  const chestWidth = size * 0.8;
  const chestHeight = size * 0.5;
  const chestX = -chestWidth / 2;
  const chestY = -chestHeight / 2 + size * 0.12;

  // Body outline
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.strokeRect(chestX, chestY, chestWidth, chestHeight);

  // Body fill with gradient
  const bodyGrad = ctx.createLinearGradient(chestX, chestY, chestX, chestY + chestHeight);
  bodyGrad.addColorStop(0, woodLight);
  bodyGrad.addColorStop(0.5, woodMain);
  bodyGrad.addColorStop(1, woodDark);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(chestX, chestY, chestWidth, chestHeight);

  // Chest lid (curved top)
  const lidHeight = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(chestX - size * 0.03, chestY);
  ctx.lineTo(chestX + chestWidth + size * 0.03, chestY);
  ctx.lineTo(chestX + chestWidth, chestY - lidHeight * 0.4);
  ctx.quadraticCurveTo(chestX + chestWidth / 2, chestY - lidHeight, chestX, chestY - lidHeight * 0.4);
  ctx.closePath();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.stroke();
  const lidGrad = ctx.createLinearGradient(0, chestY - lidHeight, 0, chestY);
  lidGrad.addColorStop(0, woodDark);
  lidGrad.addColorStop(0.5, woodMain);
  lidGrad.addColorStop(1, woodLight);
  ctx.fillStyle = lidGrad;
  ctx.fill();

  // Metal bands with outlines
  ctx.fillStyle = metalDark;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;

  // Top band
  ctx.fillRect(chestX, chestY, chestWidth, size * 0.045);
  ctx.strokeRect(chestX, chestY, chestWidth, size * 0.045);
  // Bottom band
  ctx.fillRect(chestX, chestY + chestHeight - size * 0.045, chestWidth, size * 0.045);
  ctx.strokeRect(chestX, chestY + chestHeight - size * 0.045, chestWidth, size * 0.045);
  // Vertical bands
  ctx.fillRect(chestX + chestWidth * 0.12, chestY, size * 0.04, chestHeight);
  ctx.strokeRect(chestX + chestWidth * 0.12, chestY, size * 0.04, chestHeight);
  ctx.fillRect(chestX + chestWidth * 0.84, chestY, size * 0.04, chestHeight);
  ctx.strokeRect(chestX + chestWidth * 0.84, chestY, size * 0.04, chestHeight);

  // Metal highlights
  ctx.fillStyle = metalLight;
  ctx.fillRect(chestX + chestWidth * 0.12, chestY, size * 0.015, chestHeight);
  ctx.fillRect(chestX + chestWidth * 0.84, chestY, size * 0.015, chestHeight);

  // Lock (golden padlock)
  const lockSize = size * 0.18;
  const lockY = chestY + chestHeight * 0.35;
  const goldMain = '#FFD700';
  const goldDark = '#B8860B';
  const goldLight = '#FFF8DC';

  // Lock shackle outline and fill
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, lockY, lockSize * 0.38, Math.PI, 0, false);
  ctx.stroke();
  ctx.strokeStyle = goldMain;
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.arc(0, lockY, lockSize * 0.38, Math.PI, 0, false);
  ctx.stroke();

  // Lock body outline
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.strokeRect(-lockSize / 2, lockY, lockSize, lockSize * 0.75);
  // Lock body fill
  const lockGrad = ctx.createLinearGradient(-lockSize / 2, lockY, lockSize / 2, lockY);
  lockGrad.addColorStop(0, goldDark);
  lockGrad.addColorStop(0.3, goldMain);
  lockGrad.addColorStop(0.5, goldLight);
  lockGrad.addColorStop(0.7, goldMain);
  lockGrad.addColorStop(1, goldDark);
  ctx.fillStyle = lockGrad;
  ctx.fillRect(-lockSize / 2, lockY, lockSize, lockSize * 0.75);

  // Keyhole
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(0, lockY + lockSize * 0.3, lockSize * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-lockSize * 0.05, lockY + lockSize * 0.35, lockSize * 0.1, lockSize * 0.25);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
