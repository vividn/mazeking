import React from 'react';
import type { ColorScheme } from '../types';

interface ProofImageProps {
  imageDataUrl: string;
  proofSizeBytes: number;
  colors: ColorScheme;
}

export function ProofImage({ imageDataUrl, proofSizeBytes, colors }: ProofImageProps) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: colors.textBackgroundColor,
    borderRadius: '8px',
  };

  const imageStyle: React.CSSProperties = {
    width: '128px',
    height: '128px',
    imageRendering: 'pixelated',
    border: `3px solid ${colors.uiAccentColor}`,
    borderRadius: '8px',
    boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3)`,
  };

  const captionStyle: React.CSSProperties = {
    fontSize: '13px',
    color: colors.wallColor,
    textAlign: 'center',
  };

  const proofSizeStyle: React.CSSProperties = {
    fontWeight: 'bold',
    color: colors.goalColor,
  };

  const successBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: colors.keyColor,
    color: '#000',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 'bold',
  };

  return (
    <div style={containerStyle}>
      <div style={successBadgeStyle}>
        <span>Proof Generated</span>
      </div>
      <img
        src={imageDataUrl}
        alt="ZK Proof visualization - proof bytes encoded as RGB pixels"
        style={imageStyle}
      />
      <div style={captionStyle}>
        <span style={proofSizeStyle}>{proofSizeBytes.toLocaleString()}</span> bytes
      </div>
    </div>
  );
}
