import React, { useEffect, useState } from 'react';
import './VolumeBar.css';

interface VolumeBarProps {
  currentVolume: number;
}

const VolumeBar: React.FC<VolumeBarProps> = ({ currentVolume }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const hideTimeout = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(hideTimeout);
  }, [currentVolume]);

  return (
    <div id="volume-bar" style={{ display: visible ? 'block' : 'none' }}>
      <div id="volume-fill" style={{ width: `${currentVolume}%` }}></div>
    </div>
  );
};

export default VolumeBar;