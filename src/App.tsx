// src/App.tsx

import React, { useEffect, useContext, useState } from 'react';
import VolumeBar from './components/VolumeBar';
import VolumeControl from './components/VolumeControl';
import Favorites from './components/Favorites';
import { DeskThing } from '@deskthing/client';
import { SettingsContext } from './contexts/SettingsContext';
import './index.css';

const App: React.FC = () => {
  const { settings, isReady } = useContext(SettingsContext);
  const [currentVolume, setCurrentVolume] = useState<number>(50);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);
  const [volumeBarVisible, setVolumeBarVisible] = useState<boolean>(false);
  const sonosIp = settings?.sonos_ip ?? '192.168.4.109';

  // Bounce function for volume bar visibility
  const bounceVolumeBar = (() => {
    let timeout: NodeJS.Timeout | null = null;
    return () => {
      setVolumeBarVisible(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setVolumeBarVisible(false), 5000);
    };
  })();

  // Poll volume every 5 seconds
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      DeskThing.send({ type: 'get', request: 'currentVolume' });
    }, 5000);

    return () => clearInterval(interval);
  }, [isReady]);

  // Initial data setup
  useEffect(() => {
    if (!isReady) return;

    DeskThing.send({ type: 'get', request: 'selectedVolumeSpeakers' });
    DeskThing.send({ type: 'get', request: 'currentVolume' });

    const volumeListener = DeskThing.on('volumeChange', (data) => {
      if (data.payload?.volume !== undefined) {
        setCurrentVolume(data.payload.volume);
        bounceVolumeBar();
      }
    });

    const speakerListener = DeskThing.on('selectedVolumeSpeakers', (data) => {
      if (data.payload?.uuids) {
        setSelectedVolumeSpeakers(data.payload.uuids);
      }
    });

    return () => {
      volumeListener();
      speakerListener();
    };
  }, [sonosIp, isReady]);

  // Handle wheel scrolling
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const delta = event.deltaX < 0 ? -1 : 1;
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'adjustVolume',
        payload: { delta },
      });
      bounceVolumeBar();
      event.preventDefault();
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="app-container">
      <VolumeBar currentVolume={currentVolume} visible={volumeBarVisible} />
      <div className="top-controls">
        <VolumeControl
          currentVolume={currentVolume}
          setCurrentVolume={setCurrentVolume}
          selectedVolumeSpeakers={selectedVolumeSpeakers}
          setSelectedVolumeSpeakers={setSelectedVolumeSpeakers}
        />
      </div>
      <div className="favorites-section">
        <Favorites />
      </div>
    </div>
  );
};

export default App;
