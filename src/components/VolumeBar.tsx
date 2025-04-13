// src/components/VolumeBar.tsx

import React from 'react';
import './VolumeBar.css';

interface VolumeBarProps {
  currentVolume: number;
  visible: boolean;
}

const VolumeBar: React.FC<VolumeBarProps> = ({ currentVolume, visible }) => {
  const barHeight = `${Math.min(100, Math.max(0, currentVolume))}%`;

  return (
    <div className={`volume-bar-container ${visible ? 'fade-in' : 'fade-out'}`}>
      <div className="volume-percentage-label">{currentVolume}%</div>
      <div className="volume-bar">
        <div className="volume-fill" style={{ height: barHeight }} />
      </div>
    </div>
  );
};

export default VolumeBar;
