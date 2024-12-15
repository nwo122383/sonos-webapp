// src/components/PlaybackControl.tsx

import React, { useEffect, useState } from 'react';
import './PlaybackControl.css';
import { DeskThing, SocketData } from 'deskthing-client';

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
}

const PlaybackControl = () => {
  const [speakers, _setSpeakers] = useState<Speaker[]>([]);
  const [selectedPlaybackSpeakers, setSelectedPlaybackSpeakers] = useState<string[]>([]);

  useEffect(() => {
    // Request zone group state
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'zoneGroupState',
    })

    const handleZoneMessage = (socketData: SocketData) => {
      if (socketData.type === 'zoneGroupState') {
        // Parse speakers from zone group state as before
        // ... (same as previous implementation)
      }
    };

    const handlePlaybackMessage = (socketData: SocketData) => {
      if (socketData.type === 'selectedPlaybackSpeakers' && socketData.payload.uuids) {
        setSelectedPlaybackSpeakers(socketData.payload.uuids);
      }
    };
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'selectedPlaybackSpeakers',
    })

    const removeZoneListener = DeskThing.on('zoneGroupState', handleZoneMessage);
    const removePlaybackListener = DeskThing.on('selectedPlaybackSpeakers', handlePlaybackMessage);



    return () => {
      removePlaybackListener()
      removeZoneListener()
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
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'selectPlaybackSpeakers',
        payload: { uuids: newSelected },
      })


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
