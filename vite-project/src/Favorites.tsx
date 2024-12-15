// src/components/Favorites.tsx

import React, { useEffect, useState } from 'react';
import './Favorites.css';

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
  const [selectedSpeakerUUIDs, setSelectedSpeakerUUIDs] = useState<string[]>([]);

  useEffect(() => {
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
      } else if (event.data.type === 'selectedSpeakers' && event.data.payload.uuids) {
        setSelectedSpeakerUUIDs(event.data.payload.uuids);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request the currently selected speakers
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'selectedSpeakers',
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

  const selectSpeaker = (uuid: string) => {
    setSelectedSpeakerUUIDs((prevSelected) => {
      let newSelected;
      if (prevSelected.includes(uuid)) {
        newSelected = prevSelected.filter((id) => id !== uuid);
      } else {
        newSelected = [...prevSelected, uuid];
      }

      window.parent.postMessage(
        {
          type: 'IFRAME_ACTION',
          payload: {
            app: 'sonos-webapp',
            type: 'set',
            request: 'selectSpeakers',
            payload: { uuids: newSelected },
          },
        },
        '*'
      );

      return newSelected;
    });
  };

  const handleFavoriteClick = (favorite: Favorite) => {
    if (selectedSpeakerUUIDs.length === 0) {
      alert('Please select at least one speaker to play the favorite.');
      return;
    }

    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'playFavorite',
          payload: {
            uri: favorite.uri,
            speakerUUIDs: selectedSpeakerUUIDs,
          },
        },
      },
      '*'
    );
  };

  return (
    <div id="favorites-container">
      <h2>Select speaker to play favorites on</h2>

      <button
        onClick={() => {
          if (selectedSpeakerUUIDs.length === speakers.length) {
            setSelectedSpeakerUUIDs([]);

            window.parent.postMessage(
              {
                type: 'IFRAME_ACTION',
                payload: {
                  app: 'sonos-webapp',
                  type: 'set',
                  request: 'selectSpeakers',
                  payload: { uuids: [] },
                },
              },
              '*'
            );
          } else {
            const allUUIDs = speakers.map((speaker) => speaker.uuid);
            setSelectedSpeakerUUIDs(allUUIDs);

            window.parent.postMessage(
              {
                type: 'IFRAME_ACTION',
                payload: {
                  app: 'sonos-webapp',
                  type: 'set',
                  request: 'selectSpeakers',
                  payload: { uuids: allUUIDs },
                },
              },
              '*'
            );
          }
        }}
        className="select-all-button"
      >
        {selectedSpeakerUUIDs.length === speakers.length ? 'Deselect All Speakers' : 'Select All Speakers'}
      </button>

      <div className="speakers-list">
        {speakers.map((speaker, idx) => {
          const speakerIP = extractIPAddress(speaker.location);
          const isSelected = selectedSpeakerUUIDs.includes(speaker.uuid);

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
