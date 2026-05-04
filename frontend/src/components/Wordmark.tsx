import { getCharPattern, getTextDimensions } from '../lib/pixelFont';

interface WordmarkProps {
  text: string;
  pixelSize?: number;
  color: string;
  zkColor?: string;
  crownColor?: string;
  ariaLabel?: string;
  lineSpacing?: number;
}

function colorForChar(
  char: string,
  base: string,
  zk?: string,
  crown?: string
): string {
  if (char === '♚') return crown ?? base;
  const u = char.toUpperCase();
  if (u === 'Z' || u === 'K') return zk ?? base;
  return base;
}

export function Wordmark({
  text,
  pixelSize = 4,
  color,
  zkColor,
  crownColor,
  ariaLabel,
  lineSpacing = 3,
}: WordmarkProps) {
  const lines = text.split('\n');
  const lineDims = lines.map((l) => getTextDimensions(l));
  const maxWidth = lineDims.reduce((m, d) => Math.max(m, d.width), 0);
  const totalH =
    lineDims.reduce((sum, d) => sum + d.height, 0) +
    Math.max(0, lines.length - 1) * lineSpacing;

  const baseYs: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < lineDims.length; i++) {
      baseYs.push(acc);
      acc += lineDims[i].height + lineSpacing;
    }
  }

  const svgW = maxWidth * pixelSize;
  const svgH = totalH * pixelSize;

  const rects: React.ReactNode[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const dims = lineDims[li];
    const baseY = baseYs[li];
    let cursorX = Math.floor((maxWidth - dims.width) / 2);

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const pattern = getCharPattern(char);
      if (!pattern || pattern.length === 0) {
        cursorX += 3 + 1;
        continue;
      }
      const charW = pattern[0].length;
      const fill = colorForChar(char, color, zkColor, crownColor);
      for (let y = 0; y < pattern.length; y++) {
        for (let x = 0; x < pattern[y].length; x++) {
          if (pattern[y][x]) {
            rects.push(
              <rect
                key={`${li}-${i}-${x}-${y}`}
                x={(cursorX + x) * pixelSize}
                y={(baseY + y) * pixelSize}
                width={pixelSize}
                height={pixelSize}
                fill={fill}
              />
            );
          }
        }
      }
      cursorX += charW;
      if (i < line.length - 1) cursorX += 1;
    }
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={ariaLabel ?? text}
      style={{ display: 'block' }}
    >
      {rects}
    </svg>
  );
}
