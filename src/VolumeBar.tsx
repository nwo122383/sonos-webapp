// src/components/VolumeBar.tsx

import React, { useEffect, useState } from 'react';
import { DeskThing, SocketData } from 'deskthing-client';
import './VolumeBar.css';

const VolumeBar = () => {
  const [volume, setVolume] = useState<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'currentVolume' && event.data.payload.volume !== undefined) {
        setVolume(event.data.payload.volume);
        setVisible(true);
      } else if (event.data.type === 'selectedVolumeSpeakers' && event.data.payload.uuids) {
        setSelectedVolumeSpeakers(event.data.payload.uuids);
        fetchCurrentVolume(event.data.payload.uuids);
      } else if (event.data.type === 'volumeChange' && event.data.payload.volume !== undefined) {
        setVolume(event.data.payload.volume);
        setVisible(true);
      }
    };

    window.addEventListener('message', handleMessage);

    fetchSelectedVolumeSpeakers();

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const fetchSelectedVolumeSpeakers = () => {
    DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'selectedVolumeSpeakers',
        },
          );
  };

  const fetchCurrentVolume = (speakerUUIDs: string[]) => {
    if (speakerUUIDs.length === 0) {
      return;
    }

    // For simplicity, fetch volume from the first selected speaker
    DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'volume',
          payload: { speakerUUIDs },
        },
     
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
      event.preventDefault();
      event.stopPropagation();

      if (selectedVolumeSpeakers.length === 0) {
        return;
      }

      let volumeChange = 0;
      if (event.deltaX < 0) {
        volumeChange = -5;
      } else if (event.deltaX > 0) {
        volumeChange = 5;
      }

      if (volumeChange !== 0) {
        const newVolume = Math.min(100, Math.max(0, (volume || 0) + volumeChange));

        setVolume(newVolume);
        setVisible(true);

        DeskThing.send({
              app: 'sonos-webapp',
              type: 'set',
              request: 'volumeChange',
              payload: {
                volume: newVolume,
                speakerUUIDs: selectedVolumeSpeakers,
              },
            },
          
        );
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => window.removeEventListener('wheel', handleWheel);
  }, [volume, selectedVolumeSpeakers]);

  return (
    <div id="volume-bar" style={{ display: visible ? 'block' : 'none' }}>
      {typeof volume === 'number' && (
        <div id="volume-fill" style={{ width: `${volume}%` }}></div>
      )}
    </div>
  );
};

export default VolumeBar;
