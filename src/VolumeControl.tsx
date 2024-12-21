import React, { useEffect, useState } from 'react';
import { DeskThing } from 'deskthing-client';
import './VolumeControl.css';

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
}

interface VolumeControlProps {
  setCurrentVolume: (volume: number) => void;
  selectedVolumeSpeakers: string[];
  setSelectedVolumeSpeakers: (uuids: string[]) => void;
}

const VolumeControl: React.FC<VolumeControlProps> = ({ setCurrentVolume, selectedVolumeSpeakers, setSelectedVolumeSpeakers }) => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [volumeLevels, setVolumeLevels] = useState<{ [uuid: string]: number }>({});

  useEffect(() => {
    fetchSpeakers();
    fetchSelectedVolumeSpeakers();
  }, []);

  const fetchSpeakers = () => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'speakersList',
    });
  };

  const fetchSelectedVolumeSpeakers = () => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'selectedVolumeSpeakers',
    });
  };

  const fetchCurrentVolume = (uuid: string) => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'volume',
      payload: { speakerUUIDs: [uuid] },
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'speakersList') {
        setSpeakers(data.payload);
      } else if (data.type === 'currentVolume') {
        const { uuid, volume } = data.payload;
        setVolumeLevels((prev) => ({ ...prev, [uuid]: volume }));
        if (selectedVolumeSpeakers.includes(uuid)) {
          setCurrentVolume(volume);
        }
      } else if (data.type === 'volumeChange' && data.payload.volume !== undefined) {
        const { volume } = data.payload;
        setVolumeLevels((prev) => {
          const updatedLevels = { ...prev };
          selectedVolumeSpeakers.forEach((uuid) => {
            updatedLevels[uuid] = volume;
          });
          return updatedLevels;
        });
        setCurrentVolume(volume);
      } else if (data.type === 'selectedVolumeSpeakers' && data.payload.uuids) {
        setSelectedVolumeSpeakers(data.payload.uuids);
        data.payload.uuids.forEach((uuid: string) => fetchCurrentVolume(uuid));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [selectedVolumeSpeakers, setCurrentVolume]);

  const selectVolumeSpeaker = (uuid: string) => {
    setSelectedVolumeSpeakers((prevSelected) => {
      let newSelected;
      if (prevSelected.includes(uuid)) {
        newSelected = prevSelected.filter((id) => id !== uuid);
      } else {
        newSelected = [...prevSelected, uuid];
      }

      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'selectVolumeSpeakers',
        payload: { uuids: newSelected },
      });

      // Fetch the current volume for the newly selected speaker
      if (!prevSelected.includes(uuid)) {
        fetchCurrentVolume(uuid);
      }

      return newSelected;
    });
  };

  const adjustVolume = (uuid: string, delta: number) => {
    const currentVolume = volumeLevels[uuid] || 0;
    const newVolume = Math.min(100, Math.max(0, currentVolume + delta));
    setVolumeLevels((prev) => ({ ...prev, [uuid]: newVolume }));

    if (selectedVolumeSpeakers.includes(uuid)) {
      setCurrentVolume(newVolume);
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'volumeChange',
      payload: {
        volume: newVolume,
        speakerUUIDs: [uuid],
      },
    });
  };

  return (
    <div
      id="volume-control"
      style={{ overflowY: 'auto', height: '100%' }}
    >
      <h2>Volume Speaker Selection</h2>
      <div className="speakers-list">
        {speakers.map((speaker) => {
          const isSelected = selectedVolumeSpeakers.includes(speaker.uuid);
          return (
            <div key={speaker.uuid} className={`speaker-item ${isSelected ? 'selected' : ''}`}>
              <div className="speaker-info">
                <strong>{speaker.zoneName}</strong>
              </div>
              <div className="speaker-controls">
                <button onClick={() => adjustVolume(speaker.uuid, -5)} className="volume-minus-button">-</button>
                <button
                  onClick={() => selectVolumeSpeaker(speaker.uuid)}
                  className={`select-speaker-button ${isSelected ? 'selected' : ''}`}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </button>
                <button onClick={() => adjustVolume(speaker.uuid, 5)} className="volume-plus-button">+</button>
                {isSelected && (
                  <div className="volume-display">
                    Volume: {volumeLevels[speaker.uuid] !== undefined ? volumeLevels[speaker.uuid] : '...'}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VolumeControl;