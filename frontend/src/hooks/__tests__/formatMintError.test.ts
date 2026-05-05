import { describe, it, expect } from 'vitest';
import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
  UserRejectedRequestError,
} from 'viem';
import { formatMintError } from '../useMintNFT';

describe('formatMintError', () => {
  it('returns null when there is no error', () => {
    expect(formatMintError(null)).toBeNull();
    expect(formatMintError(undefined)).toBeNull();
  });

  it('detects user wallet rejection (EIP-1193 4001) anywhere in the cause chain', () => {
    const rejected = new UserRejectedRequestError(new Error('User denied'));
    const wrapped = new BaseError('write failed', { cause: rejected });
    expect(formatMintError(wrapped)).toBe('Wallet rejected the transaction.');
  });

  it('decodes a contract revert reason from the cause chain', () => {
    const reverted = new ContractFunctionRevertedError({
      abi: [],
      functionName: 'mintWithProof',
      message: 'execution reverted: PROOF_INVALID',
    });
    // viem ctor sets `reason` from the message when it can't decode the ABI;
    // force it for a deterministic test:
    Object.assign(reverted, { reason: 'PROOF_INVALID' });

    const wrapped = new BaseError('contract call failed', { cause: reverted });
    expect(formatMintError(wrapped)).toBe(
      'Transaction reverted: PROOF_INVALID'
    );
  });

  it('reports a network/RPC failure for HttpRequestError', () => {
    const http = new HttpRequestError({
      body: {},
      url: 'https://rpc.example/',
      details: 'fetch failed',
    });
    expect(formatMintError(http)).toBe(
      'Network error: failed to reach RPC. Try again.'
    );
  });

  it('reports a timeout for TimeoutError', () => {
    const timeout = new TimeoutError({
      body: {},
      url: 'https://rpc.example/',
    });
    expect(formatMintError(timeout)).toBe(
      'Transaction timed out waiting for confirmation. Try again.'
    );
  });

  it('falls back to BaseError shortMessage for uncategorized viem errors', () => {
    const generic = new BaseError('something else broke');
    expect(formatMintError(generic)).toBe('something else broke');
  });

  it('detects fetch/CORS failures from plain Error messages', () => {
    expect(formatMintError(new Error('Failed to fetch'))).toBe(
      'Network error: failed to reach RPC. Try again.'
    );
    expect(
      formatMintError(
        new Error('TypeError: NetworkError when attempting to fetch resource')
      )
    ).toBe('Network error: failed to reach RPC. Try again.');
  });

  it('falls back to a "see console" message for fully opaque errors', () => {
    expect(formatMintError(new Error(''))).toBe('Mint failed — see console.');
    expect(formatMintError({ weird: 'object' })).toMatch(/^Mint failed — /);
  });
});
