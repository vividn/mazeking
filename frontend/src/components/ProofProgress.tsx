import React from 'react';
import type { ProofStage } from '../lib/proofService';
import type { ColorScheme } from '../types';

interface ProofProgressProps {
  stage: ProofStage;
  progress: number;
  colors: ColorScheme;
}

const stageLabels: Record<ProofStage, string> = {
  idle: '',
  'loading-circuit': 'Loading circuit...',
  'initializing-noir': 'Initializing Noir...',
  'initializing-backend': 'Initializing prover backend...',
  'generating-witness': 'Generating witness...',
  'generating-proof': 'Generating proof (this may take a while)...',
  complete: 'Proof complete!',
  error: 'Error',
};

export function ProofProgress({ stage, progress, colors }: ProofProgressProps) {
  const isIndeterminate = stage === 'generating-proof';

  const containerStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px',
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '8px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '14px',
    color: colors.wallColor,
    marginBottom: '12px',
    textAlign: 'center',
  };

  const progressBarContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
    overflow: 'hidden',
  };

  const progressBarStyle: React.CSSProperties = {
    height: '100%',
    backgroundColor: colors.uiAccentColor,
    borderRadius: '4px',
    transition: isIndeterminate ? 'none' : 'width 0.3s ease',
    width: isIndeterminate ? '30%' : `${progress}%`,
    animation: isIndeterminate ? 'slideProgress 1.5s ease-in-out infinite' : 'none',
  };

  const percentageStyle: React.CSSProperties = {
    fontSize: '12px',
    color: colors.wallColor,
    opacity: 0.7,
    marginTop: '8px',
    textAlign: 'center',
  };

  return (
    <>
      <style>
        {`
          @keyframes slideProgress {
            0% {
              transform: translateX(-100%);
            }
            50% {
              transform: translateX(233%);
            }
            100% {
              transform: translateX(-100%);
            }
          }
        `}
      </style>
      <div style={containerStyle}>
        <div style={labelStyle}>{stageLabels[stage]}</div>
        <div style={progressBarContainerStyle}>
          <div style={progressBarStyle} />
        </div>
        {!isIndeterminate && (
          <div style={percentageStyle}>{Math.round(progress)}%</div>
        )}
      </div>
    </>
  );
}
