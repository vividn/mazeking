import { useState, useCallback } from 'react';
import type { MazeData, Position, Move } from '../types';
import { serializeForZk, generateProverInput } from '../lib/zkSerialize';
import {
  generateProof,
  proofToBase64,
  proofToImageDataUrl,
  type ProofStage,
  type ProofProgressCallback,
} from '../lib/proofService';

export interface ProofState {
  stage: ProofStage;
  progress: number;
  error?: string;
  proof?: Uint8Array;
  base64Proof?: string;
  imageDataUrl?: string;
}

export interface UseZkProofResult {
  state: ProofState;
  startProofGeneration: () => Promise<void>;
  reset: () => void;
}

export function useZkProof(
  maze: MazeData,
  moves: Move[],
  startPos: Position,
  keyPos: Position,
  goalPos: Position
): UseZkProofResult {
  const [state, setState] = useState<ProofState>({
    stage: 'idle',
    progress: 0,
  });

  const handleProgress: ProofProgressCallback = useCallback((stage, progress) => {
    setState((prev) => ({
      ...prev,
      stage,
      progress,
    }));
  }, []);

  const startProofGeneration = useCallback(async () => {
    try {
      setState({ stage: 'loading-circuit', progress: 5 });

      const zkMaze = serializeForZk(maze, startPos, keyPos, goalPos);
      const proverInput = generateProverInput(zkMaze, moves);

      const result = await generateProof(proverInput, handleProgress);

      const base64Proof = proofToBase64(result.proof);
      const imageDataUrl = proofToImageDataUrl(result.proof);

      console.log('=== ZK Proof Generated ===');
      console.log('Proof size:', result.proof.length, 'bytes');
      console.log('Base64 proof:', base64Proof);

      setState({
        stage: 'complete',
        progress: 100,
        proof: result.proof,
        base64Proof,
        imageDataUrl,
      });
    } catch (error) {
      console.error('Proof generation failed:', error);
      setState({
        stage: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [maze, moves, startPos, keyPos, goalPos, handleProgress]);

  const reset = useCallback(() => {
    setState({ stage: 'idle', progress: 0 });
  }, []);

  return { state, startProofGeneration, reset };
}
