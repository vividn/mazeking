/**
 * Draws a treasure chest glyph - locked or open with gold
 */
export function drawChest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  isOpen: boolean = false
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
  const goldMain = '#FFD700';
  const goldDark = '#B8860B';
  const goldLight = '#FFF8DC';

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

  if (isOpen) {
    // Draw gold inside the chest (visible interior)
    const interiorY = chestY + chestHeight * 0.15;
    const interiorHeight = chestHeight * 0.7;

    // Dark interior background
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(chestX + chestWidth * 0.08, interiorY, chestWidth * 0.84, interiorHeight);

    // Gold pile - multiple coins/bars
    const goldGrad = ctx.createRadialGradient(0, interiorY + interiorHeight * 0.5, 0, 0, interiorY + interiorHeight * 0.5, chestWidth * 0.4);
    goldGrad.addColorStop(0, goldLight);
    goldGrad.addColorStop(0.5, goldMain);
    goldGrad.addColorStop(1, goldDark);
    ctx.fillStyle = goldGrad;

    // Gold mound shape
    ctx.beginPath();
    ctx.moveTo(chestX + chestWidth * 0.1, interiorY + interiorHeight);
    ctx.quadraticCurveTo(chestX + chestWidth * 0.3, interiorY + interiorHeight * 0.2, 0, interiorY + interiorHeight * 0.15);
    ctx.quadraticCurveTo(chestX + chestWidth * 0.7, interiorY + interiorHeight * 0.2, chestX + chestWidth * 0.9, interiorY + interiorHeight);
    ctx.closePath();
    ctx.fill();

    // Individual gold coins on top
    const coinRadius = size * 0.055;
    const coinPositions = [
      { x: -size * 0.12, y: interiorY + interiorHeight * 0.35 },
      { x: size * 0.08, y: interiorY + interiorHeight * 0.3 },
      { x: -size * 0.02, y: interiorY + interiorHeight * 0.45 },
      { x: size * 0.15, y: interiorY + interiorHeight * 0.5 },
      { x: -size * 0.18, y: interiorY + interiorHeight * 0.55 },
    ];

    for (const coin of coinPositions) {
      const coinGrad = ctx.createRadialGradient(coin.x - coinRadius * 0.3, coin.y - coinRadius * 0.3, 0, coin.x, coin.y, coinRadius);
      coinGrad.addColorStop(0, goldLight);
      coinGrad.addColorStop(0.6, goldMain);
      coinGrad.addColorStop(1, goldDark);
      ctx.fillStyle = coinGrad;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, coinRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = goldDark;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Red gem
    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.moveTo(size * 0.02, interiorY + interiorHeight * 0.25);
    ctx.lineTo(size * 0.08, interiorY + interiorHeight * 0.35);
    ctx.lineTo(size * 0.02, interiorY + interiorHeight * 0.45);
    ctx.lineTo(-size * 0.04, interiorY + interiorHeight * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff6666';
    ctx.beginPath();
    ctx.moveTo(size * 0.02, interiorY + interiorHeight * 0.28);
    ctx.lineTo(size * 0.05, interiorY + interiorHeight * 0.35);
    ctx.lineTo(size * 0.02, interiorY + interiorHeight * 0.38);
    ctx.closePath();
    ctx.fill();

    // Open lid (hinged from back, tilted backward)
    const lidHeight = size * 0.25;
    const lidDepth = size * 0.12;
    const hingeY = chestY;

    // Lid interior (visible when open) - the underside
    ctx.fillStyle = woodDark;
    ctx.beginPath();
    ctx.moveTo(chestX, hingeY);
    ctx.lineTo(chestX + chestWidth, hingeY);
    ctx.lineTo(chestX + chestWidth - size * 0.05, hingeY - lidHeight * 0.7);
    ctx.lineTo(chestX + size * 0.05, hingeY - lidHeight * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Lid top surface (curved, seen from angle)
    ctx.beginPath();
    ctx.moveTo(chestX + size * 0.05, hingeY - lidHeight * 0.7);
    ctx.lineTo(chestX + chestWidth - size * 0.05, hingeY - lidHeight * 0.7);
    ctx.quadraticCurveTo(
      chestX + chestWidth / 2,
      hingeY - lidHeight * 1.1,
      chestX + size * 0.05,
      hingeY - lidHeight * 0.7
    );
    ctx.closePath();
    const lidGrad = ctx.createLinearGradient(0, hingeY - lidHeight * 1.1, 0, hingeY - lidHeight * 0.7);
    lidGrad.addColorStop(0, woodMain);
    lidGrad.addColorStop(1, woodDark);
    ctx.fillStyle = lidGrad;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Lid back edge (the thickness)
    ctx.fillStyle = woodDark;
    ctx.beginPath();
    ctx.moveTo(chestX + size * 0.05, hingeY - lidHeight * 0.7);
    ctx.lineTo(chestX + size * 0.05, hingeY - lidHeight * 0.7 - lidDepth);
    ctx.quadraticCurveTo(
      chestX + chestWidth / 2,
      hingeY - lidHeight * 1.1 - lidDepth,
      chestX + chestWidth - size * 0.05,
      hingeY - lidHeight * 0.7 - lidDepth
    );
    ctx.lineTo(chestX + chestWidth - size * 0.05, hingeY - lidHeight * 0.7);
    ctx.quadraticCurveTo(
      chestX + chestWidth / 2,
      hingeY - lidHeight * 1.1,
      chestX + size * 0.05,
      hingeY - lidHeight * 0.7
    );
    ctx.closePath();
    const edgeGrad = ctx.createLinearGradient(0, hingeY - lidHeight * 1.1 - lidDepth, 0, hingeY - lidHeight * 0.7);
    edgeGrad.addColorStop(0, woodLight);
    edgeGrad.addColorStop(0.5, woodMain);
    edgeGrad.addColorStop(1, woodDark);
    ctx.fillStyle = edgeGrad;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Metal band on lid edge
    ctx.fillStyle = metalDark;
    const bandY = hingeY - lidHeight * 0.72;
    ctx.fillRect(chestX + size * 0.08, bandY, chestWidth - size * 0.16, size * 0.035);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(chestX + size * 0.08, bandY, chestWidth - size * 0.16, size * 0.035);
  } else {
    // Closed chest lid (curved top)
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
  }

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

  if (!isOpen) {
    // Lock (golden padlock) - only when closed
    const lockSize = size * 0.18;
    const lockY = chestY + chestHeight * 0.35;

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
  }

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
