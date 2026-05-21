import React from 'react';
import type { ColorScheme } from '../types';
import { pickTextColor } from '../lib/contrastText';

interface ShareBlockProps {
  colors: ColorScheme;
  copied: boolean;
  onCopyLink: () => void;
}

export function ShareBlock({ colors, copied, onCopyLink }: ShareBlockProps) {
  const baseActionButtonStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '15px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.22)',
    fontFamily: 'inherit',
    minHeight: '44px',
    width: '100%',
  };

  const shareButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.goalColor,
    color: pickTextColor(colors.goalColor),
  };

  return (
    <button
      className="win-action-button"
      style={shareButtonStyle}
      onClick={onCopyLink}
      aria-label="Share this maze"
      data-testid="share-button"
    >
      {copied ? 'Link Copied!' : 'Share Maze'}
    </button>
  );
}
