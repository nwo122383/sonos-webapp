import React, { useEffect, useState, useRef } from 'react';
import DeskThing, { SocketData } from 'deskthing-client';
import './VolumeControl.css';

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
}

const VolumeControl = () => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedVolumeSpeakers, setSelectedVolumeSpeakers] = useState<string[]>([]);
  const [volumeLevels, setVolumeLevels] = useState<{ [uuid: string]: number }>({});
  const volumeControlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch the list of speakers
    fetchSpeakers();
    // Fetch selected volume speakers on mount
    fetchSelectedVolumeSpeakers();
  }, []);

  const fetchSpeakers = () => {
    DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'speakersList',
        },
      
    );
  };

  const fetchSelectedVolumeSpeakers = () => {
    DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'selectedVolumeSpeakers',
        },
       );
  };

  const fetchCurrentVolume = (uuid: string) => {
    DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'volume',
          payload: { speakerUUIDs: [uuid] },
        },
     
    );
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'speakersList') {
        setSpeakers(event.data.payload);
      } else if (event.data.type === 'currentVolume') {
        const { uuid, volume } = event.data.payload;
        setVolumeLevels((prev) => ({ ...prev, [uuid]: volume }));
      } else if (event.data.type === 'volumeChange' && event.data.payload.volume !== undefined) {
        const { volume } = event.data.payload;
        setVolumeLevels((prev) => {
          const updatedLevels = { ...prev };
          selectedVolumeSpeakers.forEach((uuid) => {
            updatedLevels[uuid] = volume;
          });
          return updatedLevels;
        });
      } else if (event.data.type === 'selectedVolumeSpeakers' && event.data.payload.uuids) {
        setSelectedVolumeSpeakers(event.data.payload.uuids);
        // Fetch the current volume for the selected speakers
        event.data.payload.uuids.forEach((uuid: string) => {
          fetchCurrentVolume(uuid);
        });
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []); // Removed dependencies to prevent unnecessary re-renders

  const selectVolumeSpeaker = (uuid: string) => {
    setSelectedVolumeSpeakers((prevSelected) => {
      let newSelected;
      if (prevSelected.includes(uuid)) {
        newSelected = prevSelected.filter((id) => id !== uuid);
      } else {
        newSelected = [...prevSelected, uuid];
      }

      // Notify backend of selected volume speakers
      DeskThing.send({
            app: 'sonos-webapp',
            type: 'set',
            request: 'selectVolumeSpeakers',
            payload: { uuids: newSelected },
          },
        
      );

      // Fetch the current volume for the newly selected speaker
      if (!prevSelected.includes(uuid)) {
        fetchCurrentVolume(uuid);
      }

      return newSelected;
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (selectedVolumeSpeakers.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    let volumeChange = 0;
    if (event.deltaX < 0) {
      volumeChange = -5;
    } else if (event.deltaX > 0) {
      volumeChange = 5;
    }

    if (volumeChange !== 0) {
      selectedVolumeSpeakers.forEach((uuid) => {
        const currentVolume = volumeLevels[uuid] || 0;
        const newVolume = Math.min(100, Math.max(0, currentVolume + volumeChange));

        setVolumeLevels((prev) => ({ ...prev, [uuid]: newVolume }));

        DeskThing.send({
              app: 'sonos-webapp',
              type: 'set',
              request: 'volumeChange',
              payload: {
                volume: newVolume,
                speakerUUIDs: [uuid],
              },
            },
          
        );
      });
    }
  };

  const adjustVolume = (uuid: string, delta: number) => {
    const currentVolume = volumeLevels[uuid] || 0;
    const newVolume = Math.min(100, Math.max(0, currentVolume + delta));

    setVolumeLevels((prev) => ({ ...prev, [uuid]: newVolume }));

    DeskThing.send({
          app: 'sonos-webapp',
          type: 'set',
          request: 'volumeChange',
          payload: {
            volume: newVolume,
            speakerUUIDs: [uuid],
          },
        },
     
    );
  };

  return (
    <div
      id="volume-control"
      onWheel={handleWheel}
      ref={volumeControlRef}
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
  <button
    onClick={() => adjustVolume(speaker.uuid, -5)}
    className="volume-minus-button"
  >
    -
  </button>
  <button
    onClick={() => selectVolumeSpeaker(speaker.uuid)}
    className={`select-speaker-button ${isSelected ? 'selected' : ''}`}
  >
    {isSelected ? 'Selected' : 'Select'}
  </button>
  <button
    onClick={() => adjustVolume(speaker.uuid, 5)}
    className="volume-plus-button"
  >
    +
  </button>
  {isSelected && (
    <div className="volume-display">
      Volume:{' '}
      {volumeLevels[speaker.uuid] !== undefined ? volumeLevels[speaker.uuid] : '...'}%
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
