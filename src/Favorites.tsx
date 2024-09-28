// src/components/Favorites.tsx

import React, { useEffect, useState } from 'react';
import './index.css';

interface Favorite {
  uri: string;
  title: string;
  albumArt: string;
}

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
}

const Favorites = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerUUID, setSelectedSpeakerUUID] = useState<string | null>(null);

  useEffect(() => {
    // Request favorites and zone group state
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'favorites',
        },
      },
      '*'
    );

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
      if (event.data.type === 'favorites') {
        setFavorites(event.data.payload);
      } else if (event.data.type === 'zoneGroupState') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(event.data.payload, 'text/xml');
        const groupElements = Array.from(xmlDoc.getElementsByTagName('ZoneGroup'));

        const allSpeakers: Speaker[] = [];

        groupElements.forEach((groupElement) => {
          const coordinatorUUID = groupElement.getAttribute('Coordinator');
          const groupId = groupElement.getAttribute('ID') || '';
          const members = Array.from(groupElement.getElementsByTagName('ZoneGroupMember'));

          members.forEach((member) => {
            const uuid = member.getAttribute('UUID');
            const location = member.getAttribute('Location');
            const zoneName = member.getAttribute('ZoneName');
            const isCoordinator = uuid === coordinatorUUID;

            allSpeakers.push({
              uuid: uuid || '',
              location: location || '',
              zoneName: zoneName || '',
              isCoordinator,
              groupId,
            });
          });
        });

        setSpeakers(allSpeakers);
      } else if (event.data.type === 'selectedSpeaker' && event.data.payload.uuid) {
        setSelectedSpeakerUUID(event.data.payload.uuid);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request the currently selected speaker
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

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const extractIPAddress = (url: string) => {
    try {
      const parsedURL = new URL(url);
      return parsedURL.hostname;
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  };

  const addSpeakerToGroup = (speakerIP: string, coordinatorIP: string) => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'addSpeakerToGroup',
          payload: { speakerIP, coordinatorIP },
        },
      },
      '*'
    );
  };

  const leaveGroup = (speakerIP: string) => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'leaveGroup',
          payload: { speakerIP },
        },
      },
      '*'
    );
  };

  const handleFavoriteClick = (favorite: Favorite) => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'playFavorite',
          payload: { uri: favorite.uri },
        },
      },
      '*'
    );
  };

  const selectSpeaker = (uuid: string) => {
    setSelectedSpeakerUUID(uuid);

    // Notify the backend of the selected speaker
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'selectSpeaker',
          payload: { uuid },
        },
      },
      '*'
    );
  };

  return (
    <div id="favorites-container">
      <h2>Speakers</h2>
      <div className="speakers-list">
        {speakers.map((speaker, idx) => {
          const speakerIP = extractIPAddress(speaker.location);
          const isSelected = selectedSpeakerUUID === speaker.uuid;
          const coordinatorSpeaker = speakers.find((s) => s.groupId === speaker.groupId && s.isCoordinator);
          const coordinatorIP = coordinatorSpeaker ? extractIPAddress(coordinatorSpeaker.location) : null;
          const coordinatorName = coordinatorSpeaker ? coordinatorSpeaker.zoneName : 'Group';

          return (
            <div key={idx} className={`speaker-item ${isSelected ? 'selected' : ''}`}>
              <div className="speaker-info">
                <strong>{speaker.zoneName}</strong> - {speakerIP}
              </div>
              <div className="speaker-controls">
                <button
                  onClick={() => selectSpeaker(speaker.uuid)}
                  className={`select-speaker-button ${isSelected ? 'selected' : ''}`}
                >
                  {isSelected ? `Selected: ${speaker.zoneName}` : `Select Speaker: ${speaker.zoneName}`}
                </button>
                {!speaker.isCoordinator && (
                  <button
                    onClick={() => {
                      if (coordinatorIP && speakerIP) {
                        addSpeakerToGroup(speakerIP, coordinatorIP);
                      }
                    }}
                    className="group-button"
                  >
                    Join {coordinatorName} Group
                  </button>
                )}
                {speaker.isCoordinator && (
                  <button
                    onClick={() => {
                      if (speakerIP) {
                        leaveGroup(speakerIP);
                      }
                    }}
                    className="group-button"
                  >
                    Leave Group
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2>Favorites</h2>
      <div className="favorites-grid">
        {favorites.map((favorite) => (
          <div
            key={favorite.uri}
            className="favorite-item"
            onClick={() => handleFavoriteClick(favorite)}
          >
            <img src={favorite.albumArt || 'default-image.jpg'} alt="Album Art" />
            <div>{favorite.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Favorites;
