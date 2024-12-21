import React, { useState, useEffect } from 'react';
import TrackInfo from './TrackInfo';
import Favorites from './Favorites';
import VolumeBar from './VolumeBar';
import VolumeControl from './VolumeControl';
import PlaybackControl from './PlaybackControl';
import Controls from './Controls';
import './index.css';
import { DeskThing } from 'deskthing-client';

const App = () => {
  const [currentVolume, setCurrentVolume] = useState<number>(50);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);

  useEffect(() => {
    // Fetch initial volume and selected speakers
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedVolumeSpeakers' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'volume' });

    const handleVolumeChange = (data: any) => {
      if (data.type === 'volumeChange' && data.payload.volume !== undefined) {
        setCurrentVolume(data.payload.volume);
      }
    };

    const handleSelectedVolumeSpeakers = (data: any) => {
      if (data.type === 'selectedVolumeSpeakers' && data.payload.uuids) {
        setSelectedVolumeSpeakers(data.payload.uuids);
      }
    };

    const volumeChangeListener = DeskThing.on('volumeChange', handleVolumeChange);
    const selectedSpeakersListener = DeskThing.on('selectedVolumeSpeakers', handleSelectedVolumeSpeakers);

    return () => {
      volumeChangeListener();
      selectedSpeakersListener();
    };
  }, []);

  useEffect(() => {
    const handleGlobalWheel = (event: WheelEvent) => {
      if (selectedVolumeSpeakers.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const volumeChange = event.deltaX > 0 ? 5 : -5; // Adjust by 5% per scroll with deltaX
      const newVolume = Math.min(100, Math.max(0, currentVolume + volumeChange));
      setCurrentVolume(newVolume);

      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'volumeChange',
        payload: {
          volume: newVolume,
          speakerUUIDs: selectedVolumeSpeakers,
        },
      });
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [currentVolume, selectedVolumeSpeakers]);

  return (
    <div className="app-container">
      <VolumeBar currentVolume={currentVolume} />
      <div className="top-controls">
        <VolumeControl 
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