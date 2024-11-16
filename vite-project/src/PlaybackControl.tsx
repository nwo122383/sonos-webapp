// src/components/PlaybackControl.tsx

import React, { useEffect, useState } from 'react';
import './PlaybackControl.css';

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
}

const PlaybackControl = () => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedPlaybackSpeakers, setSelectedPlaybackSpeakers] = useState<string[]>([]);

  useEffect(() => {
    // Request zone group state
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'zoneGroupState',
        },
      },
      '*'
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'zoneGroupState') {
        // Parse speakers from zone group state as before
        // ... (same as previous implementation)
      } else if (event.data.type === 'selectedPlaybackSpeakers' && event.data.payload.uuids) {
        setSelectedPlaybackSpeakers(event.data.payload.uuids);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request the currently selected playback speakers
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'selectedPlaybackSpeakers',
        },
      },
      '*'
    );

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const selectPlaybackSpeaker = (uuid: string) => {
    setSelectedPlaybackSpeakers((prevSelected) => {
      let newSelected;
      if (prevSelected.includes(uuid)) {
        newSelected = prevSelected.filter((id) => id !== uuid);
      } else {
        newSelected = [...prevSelected, uuid];
      }

      // Notify backend of selected playback speakers
      window.parent.postMessage(
        {
          type: 'IFRAME_ACTION',
          payload: {
            app: 'sonos-webapp',
            type: 'set',
            request: 'selectPlaybackSpeakers',
            payload: { uuids: newSelected },
          },
        },
        '*'
      );

      return newSelected;
    });
  };

  return (
    <div id="playback-control">
      <h2>Play Favorites On...</h2>
      <div className="speakers-list">
        {speakers.map((speaker) => {
          const isSelected = selectedPlaybackSpeakers.includes(speaker.uuid);
          return (
            <div key={speaker.uuid} className={`speaker-item ${isSelected ? 'selected' : ''}`}>
              <div className="speaker-info">
                <strong>{speaker.zoneName}</strong>
              </div>
              <div className="speaker-controls">
                <button
                  onClick={() => selectPlaybackSpeaker(speaker.uuid)}
                  className={`select-speaker-button ${isSelected ? 'selected' : ''}`}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlaybackControl;
