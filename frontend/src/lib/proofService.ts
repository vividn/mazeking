import { Noir, type CompiledCircuit, type InputMap } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import type { ProverInput } from './zkSerialize';

export type ProofStage =
  | 'idle'
  | 'loading-circuit'
  | 'initializing-noir'
  | 'initializing-backend'
  | 'generating-witness'
  | 'generating-proof'
  | 'complete'
  | 'error';

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
}

export type ProofProgressCallback = (stage: ProofStage, progress: number) => void;

let circuitCache: CompiledCircuit | null = null;
let noirInstance: Noir | null = null;
let backendInstance: UltraHonkBackend | null = null;

async function loadCircuit(onProgress?: ProofProgressCallback): Promise<CompiledCircuit> {
  if (circuitCache) {
    return circuitCache;
  }

  onProgress?.('loading-circuit', 10);

  const response = await fetch('/circuit/maze_prover.json');
  if (!response.ok) {
    throw new Error(`Failed to load circuit: ${response.statusText}`);
  }

  circuitCache = await response.json();
  return circuitCache!;
}

export async function initializeProver(
  onProgress?: ProofProgressCallback
): Promise<{ noir: Noir; backend: UltraHonkBackend }> {
  if (noirInstance && backendInstance) {
    return { noir: noirInstance, backend: backendInstance };
  }

  const circuit = await loadCircuit(onProgress);

  onProgress?.('initializing-noir', 30);
  noirInstance = new Noir(circuit);

  onProgress?.('initializing-backend', 50);
  backendInstance = new UltraHonkBackend(circuit.bytecode);

  return { noir: noirInstance, backend: backendInstance };
}

export async function generateProof(
  proverInput: ProverInput,
  onProgress?: ProofProgressCallback
): Promise<ProofResult> {
  const { noir, backend } = await initializeProver(onProgress);

  onProgress?.('generating-witness', 60);
  const { witness } = await noir.execute(proverInput as unknown as InputMap);

  onProgress?.('generating-proof', 70);
  const proof = await backend.generateProof(witness);

  onProgress?.('complete', 100);

  return {
    proof: proof.proof,
    publicInputs: proof.publicInputs,
  };
}

export function proofToBase64(proof: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < proof.length; i++) {
    binary += String.fromCharCode(proof[i]);
  }
  return btoa(binary);
}

export function proofToImageDataUrl(proof: Uint8Array): string {
  const numPixels = Math.ceil(proof.length / 3);
  const side = Math.ceil(Math.sqrt(numPixels));

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(side, side);

  for (let i = 0; i < side * side; i++) {
    const proofIdx = i * 3;
    const r = proofIdx < proof.length ? proof[proofIdx] : 0;
    const g = proofIdx + 1 < proof.length ? proof[proofIdx + 1] : 0;
    const b = proofIdx + 2 < proof.length ? proof[proofIdx + 2] : 0;

    imageData.data[i * 4] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function resetProver(): void {
  noirInstance = null;
  backendInstance = null;
}
