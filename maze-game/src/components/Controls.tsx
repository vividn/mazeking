import React from 'react';

interface ControlsProps {
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => void;
  disabled?: boolean;
  accentColor: string;
}

export const Controls: React.FC<ControlsProps> = ({ onMove, disabled = false, accentColor }) => {
  const handleButtonPress = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!disabled) {
      onMove(direction);
    }
  };

  const getButtonStyle = (isCenter: boolean = false): React.CSSProperties => ({
    width: '64px',
    height: '64px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: disabled ? 'rgba(128, 128, 128, 0.3)' : `${accentColor}cc`,
    color: 'white',
    fontSize: '24px',
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: disabled
      ? '0 2px 4px rgba(0, 0, 0, 0.1)'
      : '0 4px 8px rgba(0, 0, 0, 0.2)',
    visibility: isCenter ? 'hidden' : 'visible',
    opacity: disabled ? 0.5 : 1,
  });

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      pointerEvents: 'all',
    },
    dpad: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 64px)',
      gridTemplateRows: 'repeat(3, 64px)',
      gap: '8px',
      padding: '16px',
      borderRadius: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.dpad}>
        {/* Empty top-left */}
        <div />

        {/* Up button */}
        <button
          style={getButtonStyle()}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onClick={() => handleButtonPress('up')}
          disabled={disabled}
          aria-label="Move up"
          type="button"
        >
          ▲
        </button>

        {/* Empty top-right */}
        <div />

        {/* Left button */}
        <button
          style={getButtonStyle()}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onClick={() => handleButtonPress('left')}
          disabled={disabled}
          aria-label="Move left"
          type="button"
        >
          ◀
        </button>

        {/* Center (invisible placeholder) */}
        <div style={getButtonStyle(true)} />

        {/* Right button */}
        <button
          style={getButtonStyle()}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onClick={() => handleButtonPress('right')}
          disabled={disabled}
          aria-label="Move right"
          type="button"
        >
          ▶
        </button>

        {/* Empty bottom-left */}
        <div />

        {/* Down button */}
        <button
          style={getButtonStyle()}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.15)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
          }}
          onClick={() => handleButtonPress('down')}
          disabled={disabled}
          aria-label="Move down"
          type="button"
        >
          ▼
        </button>

        {/* Empty bottom-right */}
        <div />
      </div>
    </div>
  );
};
