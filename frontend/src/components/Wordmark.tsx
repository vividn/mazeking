import { getCharPattern, getTextDimensions } from '../lib/pixelFont';

interface WordmarkProps {
  text: string;
  pixelSize?: number;
  color: string;
  ariaLabel?: string;
}

export function Wordmark({ text, pixelSize = 4, color, ariaLabel }: WordmarkProps) {
  const { width, height } = getTextDimensions(text);
  const svgW = width * pixelSize;
  const svgH = height * pixelSize;

  const rects: React.ReactNode[] = [];
  let cursorX = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const pattern = getCharPattern(char);
    if (!pattern || pattern.length === 0) {
      cursorX += 3 + 1;
      continue;
    }
    const charW = pattern[0].length;
    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[y].length; x++) {
        if (pattern[y][x]) {
          rects.push(
            <rect
              key={`${i}-${x}-${y}`}
              x={(cursorX + x) * pixelSize}
              y={y * pixelSize}
              width={pixelSize}
              height={pixelSize}
              fill={color}
            />,
          );
        }
      }
    }
    cursorX += charW;
    if (i < text.length - 1) cursorX += 1;
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
