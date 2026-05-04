import type { ColorScheme } from '../types';

interface KaztleTextProps {
  word?: string;
  colors: ColorScheme;
}

export function KaztleText({ word = 'kaztle', colors }: KaztleTextProps) {
  return (
    <>
      {Array.from(word).map((ch, i) => {
        const lower = ch.toLowerCase();
        const isZK = lower === 'z' || lower === 'k';
        return (
          <span
            key={i}
            style={isZK ? { color: colors.zkBackgroundColor } : undefined}
          >
            {ch}
          </span>
        );
      })}
    </>
  );
}
