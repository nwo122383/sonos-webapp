// src/components/VolumeBar.tsx

import React, { useEffect, useState } from 'react';
import './index.css';

const VolumeBar = () => {
  const [volume, setVolume] = useState<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const [selectedSpeakerUUID, setSelectedSpeakerUUID] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'currentVolume' && event.data.payload.volume !== undefined) {
        setVolume(event.data.payload.volume);
        setVisible(true);
      } else if (event.data.type === 'selectedSpeaker' && event.data.payload.uuid) {
        setSelectedSpeakerUUID(event.data.payload.uuid);
        // Fetch volume for the selected speaker
        fetchCurrentVolume();
      } else if (event.data.type === 'volumeChange' && event.data.payload.volume !== undefined) {
        // Update the volume when it changes
        setVolume(event.data.payload.volume);
        setVisible(true);
      }
    };

    window.addEventListener('message', handleMessage);

    // Initial fetch of the selected speaker and volume
    fetchSelectedSpeaker();

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const fetchSelectedSpeaker = () => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'selectedSpeaker',
        },
      },
      '*'
    );
  };

  const fetchCurrentVolume = () => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'volume',
        },
      },
      '*'
    );
  };

  useEffect(() => {
    if (visible) {
      const hideTimeout = setTimeout(() => {
        setVisible(false);
      }, 2000);

      return () => clearTimeout(hideTimeout);
    }
  }, [volume, visible]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault(); // Prevent default scrolling
      event.stopPropagation(); // Stop propagation

      if (typeof volume === 'number') {
        let volumeChange = 0;
        if (event.deltaX !== 0) {
          volumeChange = event.deltaX > 0 ? 5 : -5;
        } else if (event.deltaY !== 0) {
          volumeChange = event.deltaY < 0 ? 5 : -5;
        }

        if (volumeChange !== 0) {
          const newVolume = Math.min(100, Math.max(0, volume + volumeChange));

          console.log('Setting new volume:', newVolume);
          setVolume(newVolume);
          setVisible(true); // Show the volume bar when volume changes
          window.parent.postMessage(
            {
              type: 'IFRAME_ACTION',
              payload: {
                app: 'sonos-webapp',
                type: 'set',
                request: 'volumeChange',
                payload: { volume: newVolume },
              },
            },
            '*'
          );
        }
      } else {
        console.log('Volume not initialized yet.');
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => window.removeEventListener('wheel', handleWheel);
  }, [volume]);

  return (
    <div id="volume-bar" style={{ display: visible ? 'block' : 'none' }}>
      {typeof volume === 'number' && (
        <div id="volume-fill" style={{ width: `${volume}%` }}></div>
      )}
    </div>
  );
};

export default VolumeBar;
