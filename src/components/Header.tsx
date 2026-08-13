import React from 'react';
import { ConfigurationScreen } from './ConfigurationScreen';

export const Header = () => {
  const [showConfigurationScreen, setShowConfigurationScreen] = React.useState(false);

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(10, 14, 18, 0.86)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          zIndex: 400,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, letterSpacing: '0.02em' }}>Virtual Home</div>
        <button
          onClick={() => setShowConfigurationScreen(!showConfigurationScreen)}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          {showConfigurationScreen ? 'Hide' : 'Show'} Configuration
        </button>
      </div>

      {showConfigurationScreen && <ConfigurationScreen open={showConfigurationScreen} onClose={() => setShowConfigurationScreen(false)} />}
    </>
  );
};
