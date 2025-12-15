import React from 'react';
import { ColorScheme } from '../types';

interface WinModalProps {
  isOpen: boolean;
  moveCount: number;
  seed: string;
  onPlayAgain: () => void;
  onNewMaze: () => void;
  colors: ColorScheme;
}

/**
 * Win Modal Component
 * Celebrates the player's victory with a beautiful overlay.
 * Shows move count and provides options to play again or generate a new maze.
 */
export function WinModal({
  isOpen,
  moveCount,
  seed,
  onPlayAgain,
  onNewMaze,
  colors,
}: WinModalProps) {
  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 0.3s ease-out',
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: colors.pathColor,
    borderRadius: '16px',
    padding: '48px 40px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 2px ${colors.uiAccentColor}`,
    position: 'relative',
    animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  const crownStyle: React.CSSProperties = {
    fontSize: '72px',
    textAlign: 'center',
    marginBottom: '16px',
    animation: 'bounce 0.6s ease-in-out',
    filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '36px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '8px',
    color: colors.playerColor,
    textShadow: `2px 2px 4px rgba(0, 0, 0, 0.2)`,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '18px',
    textAlign: 'center',
    marginBottom: '32px',
    color: colors.wallColor,
    opacity: 0.8,
  };

  const statsContainerStyle: React.CSSProperties = {
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    textAlign: 'center',
    boxShadow: `inset 0 2px 8px rgba(0, 0, 0, 0.2)`,
  };

  const moveCountLabelStyle: React.CSSProperties = {
    fontSize: '14px',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    fontWeight: '600',
    color: colors.wallColor,
    opacity: 0.7,
    marginBottom: '8px',
  };

  const moveCountStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 'bold',
    color: colors.goalColor,
    lineHeight: 1,
    textShadow: `2px 2px 4px rgba(0, 0, 0, 0.15)`,
  };

  const zkSectionStyle: React.CSSProperties = {
    backgroundColor: colors.wallColor,
    color: colors.pathColor,
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '32px',
    textAlign: 'center',
    border: `2px dashed ${colors.uiAccentColor}`,
    opacity: 0.6,
  };

  const zkTextStyle: React.CSSProperties = {
    fontSize: '14px',
    fontStyle: 'italic',
    margin: 0,
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    flexDirection: 'column',
  };

  const baseButtonStyle: React.CSSProperties = {
    padding: '16px 32px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    fontFamily: 'inherit',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: colors.uiAccentColor,
    color: colors.pathColor,
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    backgroundColor: colors.wallColor,
    color: colors.pathColor,
  };

  const seedInfoStyle: React.CSSProperties = {
    marginTop: '24px',
    fontSize: '12px',
    textAlign: 'center',
    color: colors.wallColor,
    opacity: 0.5,
    fontFamily: 'monospace',
  };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(40px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes bounce {
            0%, 100% {
              transform: translateY(0) scale(1);
            }
            25% {
              transform: translateY(-20px) scale(1.1);
            }
            50% {
              transform: translateY(-10px) scale(1.05);
            }
            75% {
              transform: translateY(-5px) scale(1.02);
            }
          }

          .win-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          }

          .win-button:active {
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          }
        `}
      </style>
      <div style={overlayStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyle} role="dialog" aria-labelledby="win-title" aria-modal="true">
          <div style={crownStyle} aria-hidden="true">
            👑
          </div>

          <h2 id="win-title" style={titleStyle}>
            Victory!
          </h2>

          <p style={subtitleStyle}>
            You have conquered the maze
          </p>

          <div style={statsContainerStyle}>
            <div style={moveCountLabelStyle}>Moves Taken</div>
            <div style={moveCountStyle}>{moveCount}</div>
          </div>

          <div style={zkSectionStyle}>
            <p style={zkTextStyle}>
              ZK Proof & NFT Minting coming soon!
            </p>
          </div>

          <div style={buttonContainerStyle}>
            <button
              className="win-button"
              style={primaryButtonStyle}
              onClick={onPlayAgain}
              aria-label="Play the same maze again"
            >
              Play Again
            </button>

            <button
              className="win-button"
              style={secondaryButtonStyle}
              onClick={onNewMaze}
              aria-label="Generate a new maze"
            >
              New Maze
            </button>
          </div>

          <div style={seedInfoStyle}>
            Seed: {seed}
          </div>
        </div>
      </div>
    </>
  );
}
