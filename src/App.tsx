// ===============================
// src/App.tsx
// ===============================
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Favorites from './components/Favorites';
import VolumeBar from './components/VolumeBar';
import VolumeControl from './components/VolumeControl';
import NowPlaying from './components/NowPlaying';
import ToastCenter from './components/ToastCenter';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './index.css';
import { SettingsContext } from './contexts/SettingsContext';

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

const App: React.FC = () => {
  const { settings } = useContext(SettingsContext);
  const [currentVolume, setCurrentVolume] = useState<number>(50);
  const [volumeBarVisible, setVolumeBarVisible] = useState<boolean>(false);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);
  const hideTimerRef = useRef<number | null>(null);

  const parsedVolumeTimeout = Number(settings?.volume_bar_timeout);
  const volumeBarDuration = Number.isFinite(parsedVolumeTimeout)
    ? Math.max(0, parsedVolumeTimeout)
    : 2000;
  const parsedScrollDelta = Number(settings?.volume_scroll_delta);
  const scrollDelta = Number.isFinite(parsedScrollDelta)
    ? Math.max(1, Math.round(parsedScrollDelta))
    : 1;

  const bounceVolumeBar = useCallback(() => {
    setVolumeBarVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVolumeBarVisible(false), volumeBarDuration);
  }, [volumeBarDuration]);

  useEffect(() => {
    const isDark = settings?.dark_mode !== false;
    const body = document.body;
    body.classList.remove('theme-dark', 'theme-light');
    body.classList.add(isDark ? 'theme-dark' : 'theme-light');
    return () => {
      body.classList.remove('theme-dark', 'theme-light');
    };
  }, [settings?.dark_mode]);

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
  }, [bounceVolumeBar]);

  // Wheel → adjustVolume with explicit speakerUUIDs (decoupled from favorites)
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const dominant =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (dominant === 0) return;
      const delta = dominant > 0 ? scrollDelta : -scrollDelta;
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
  }, [selectedVolumeSpeakers, scrollDelta, bounceVolumeBar]);

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
