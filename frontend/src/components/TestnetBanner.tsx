import { useChainId } from 'wagmi';
import { sepolia } from 'wagmi/chains';

export function TestnetBanner() {
  const chainId = useChainId();
  if (chainId !== sepolia.id) return null;

  return (
    <div role="status" aria-live="polite" style={styles.banner}>
      <span style={styles.text}>
        <strong style={styles.strong}>Sepolia testnet — Beta.</strong> NFTs
        minted here have no real value.
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    flexShrink: 0,
    width: '100%',
    backgroundColor: '#f5c518',
    color: '#1a1a1a',
    padding: '4px 10px',
    textAlign: 'center',
    fontSize: '12px',
    lineHeight: 1.25,
    fontWeight: 500,
    borderBottom: '1px solid rgba(0, 0, 0, 0.25)',
  },
  text: {
    display: 'inline-block',
  },
  strong: {
    fontWeight: 700,
  },
};
