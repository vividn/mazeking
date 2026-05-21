import React from 'react';
import type { ColorScheme } from '../types';
import { pickTextColor } from '../lib/contrastText';

interface NavBlockProps {
  colors: ColorScheme;
  onViewCollection: () => void;
  onNewMaze: () => void;
}

export function NavBlock({ colors, onViewCollection, onNewMaze }: NavBlockProps) {
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

  const collectionButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.keyColor,
    color: pickTextColor(colors.keyColor),
  };

  const newGameButtonStyle: React.CSSProperties = {
    ...baseActionButtonStyle,
    backgroundColor: colors.wallColor,
    color: pickTextColor(colors.wallColor),
  };

  return (
    <>
      <button
        className="win-action-button"
        style={collectionButtonStyle}
        onClick={onViewCollection}
        aria-label="View your maze collection"
        data-testid="collection-button"
      >
        Collection
      </button>
      <button
        className="win-action-button"
        style={newGameButtonStyle}
        onClick={onNewMaze}
        aria-label="Start a new game"
        data-testid="new-game-button"
      >
        New Game
      </button>
    </>
  );
}
