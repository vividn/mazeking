import { useState, useCallback } from 'react';
import type { MazeData, Position, Move } from '../types';
import { serializeForZk, generateProverInput } from '../lib/zkSerialize';
import { computeMazeHash } from '../lib/mazeIdentity';
import { serializeLayoutBytes } from '../lib/tokenId';
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
  publicInputs?: string[];
  base64Proof?: string;
  imageDataUrl?: string;
  /** Pedersen hash of the canonical layout — also `publicInputs[0]`. */
  mazeHash?: `0x${string}`;
  /** Canonical layout bytes hashed to derive `mazeHash`. */
  layoutBytes?: Uint8Array;
}

export interface UseZkProofOptions {
  /**
   * When true, skip the real prover and synthesize a 9088-byte random proof
   * after a fixed delay. Used by the localhost DEBUG button to exercise the
   * full WinModal flow without playing through a maze. Never enable in prod.
   */
  mockMode?: boolean;
}

export interface UseZkProofResult {
  state: ProofState;
  startProofGeneration: () => Promise<void>;
  reset: () => void;
}

const MOCK_PROOF_BYTES = 9088;
const MOCK_DELAY_MS = 4000;
const MOCK_LAYOUT_BYTES = 32;

export function useZkProof(
  maze: MazeData,
  moves: Move[],
  startPos: Position,
  robePos: Position,
  scepterPos: Position,
  goalPos: Position,
  options: UseZkProofOptions = {}
): UseZkProofResult {
  const { mockMode = false } = options;
  const [state, setState] = useState<ProofState>({
    stage: 'idle',
    progress: 0,
  });

  const handleProgress: ProofProgressCallback = useCallback(
    (stage, progress) => {
      setState((prev) => ({
        ...prev,
        stage,
        progress,
      }));
    },
    []
  );

  const startProofGeneration = useCallback(async () => {
    if (mockMode) {
      setState({ stage: 'loading-circuit', progress: 5 });
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS / 4));
      setState({ stage: 'generating-witness', progress: 35 });
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS / 4));
      setState({ stage: 'generating-proof', progress: 70 });
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS / 2));

      const proof = crypto.getRandomValues(new Uint8Array(MOCK_PROOF_BYTES));
      const layoutBytes = crypto.getRandomValues(
        new Uint8Array(MOCK_LAYOUT_BYTES)
      );
      const mazeHash = `0x${Array.from(layoutBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}` as `0x${string}`;
      const base64Proof = proofToBase64(proof);
      const imageDataUrl = proofToImageDataUrl(proof);

      setState({
        stage: 'complete',
        progress: 100,
        proof,
        publicInputs: [mazeHash],
        base64Proof,
        imageDataUrl,
        mazeHash,
        layoutBytes,
      });
      return;
    }

    try {
      setState({ stage: 'loading-circuit', progress: 5 });

      const zkMaze = serializeForZk(
        maze,
        startPos,
        robePos,
        scepterPos,
        goalPos
      );

      // Compute the canonical layout bytes + Pedersen hash up-front. The
      // circuit re-derives the hash from the private witness and asserts
      // equality, so passing the wrong hash here will simply fail proof
      // generation rather than minting a bogus token.
      const layoutBytes = serializeLayoutBytes(zkMaze);
      const mazeHash = await computeMazeHash(layoutBytes);

      const proverInput = generateProverInput(zkMaze, moves, mazeHash);

      const result = await generateProof(proverInput, handleProgress);

      const base64Proof = proofToBase64(result.proof);
      const imageDataUrl = proofToImageDataUrl(result.proof);

      console.log('=== ZK Proof Generated ===');
      console.log('Proof size:', result.proof.length, 'bytes');
      console.log('Maze hash:', mazeHash);
      console.log('Base64 proof:', base64Proof);

      setState({
        stage: 'complete',
        progress: 100,
        proof: result.proof,
        publicInputs: result.publicInputs,
        base64Proof,
        imageDataUrl,
        mazeHash,
        layoutBytes,
      });
    } catch (error) {
      console.error('Proof generation failed:', error);
      setState({
        stage: 'error',
        progress: 0,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [
    mockMode,
    maze,
    moves,
    startPos,
    robePos,
    scepterPos,
    goalPos,
    handleProgress,
  ]);

  const reset = useCallback(() => {
    setState({ stage: 'idle', progress: 0 });
  }, []);

  return { state, startProofGeneration, reset };
}
