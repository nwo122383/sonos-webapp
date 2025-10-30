// ===============================
// src/App.tsx
// ===============================
import React, { useEffect, useRef, useState } from 'react';
import Favorites from './components/Favorites';
import VolumeBar from './components/VolumeBar';
import VolumeControl from './components/VolumeControl';
import NowPlaying from './components/NowPlaying';
import ToastCenter from './components/ToastCenter';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './index.css';

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

const App: React.FC = () => {
  const [currentVolume, setCurrentVolume] = useState<number>(50);
  const [volumeBarVisible, setVolumeBarVisible] = useState<boolean>(false);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);
  const hideTimerRef = useRef<number | null>(null);

  const bounceVolumeBar = () => {
    setVolumeBarVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVolumeBarVisible(false), 2000);
  };

  // Subscribe to volume selection + live volume events
  useEffect(() => {
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedVolumeSpeakers' });

    const offSelVol = DeskThing.on('selectedVolumeSpeakers', (data: SocketData) => {
      if (data?.type !== 'selectedVolumeSpeakers') return;
      const uuids: string[] = (data.payload as any)?.uuids || [];
      if (Array.isArray(uuids)) setSelectedVolumeSpeakers(uuids);
    });

    const offVol = DeskThing.on('volume', (data: SocketData) => {
      if (data?.type !== 'volume') return;
      const level = Number((data.payload as any)?.volume);
      if (Number.isFinite(level)) {
        setCurrentVolume(clamp(level));
        bounceVolumeBar();
      }
    });

    return () => { try { offSelVol?.(); offVol?.(); } catch {} };
  }, []);

  // Wheel → adjustVolume with explicit speakerUUIDs (decoupled from favorites)
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const delta = event.deltaX < 0 ? -1 : 1;
      if (selectedVolumeSpeakers.length > 0) {
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'set',
          request: 'adjustVolume',
          payload: { delta, speakerUUIDs: selectedVolumeSpeakers },
        });
        bounceVolumeBar();
      }
      event.preventDefault();
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [selectedVolumeSpeakers]);

  return (
    <div className="app-root">
      <div className="controls-section">
        <NowPlaying
          selectedSpeakerUUIDs={[]} // keep display decoupled
          currentVolume={currentVolume}
          onLocalVolumeChange={setCurrentVolume}
        />
        <VolumeBar visible={volumeBarVisible} currentVolume={currentVolume} />
        <VolumeControl />
      </div>

      <div className="favorites-section">
        <Favorites />
      </div>

      <ToastCenter />
    </div>
  );
};

export default App;
