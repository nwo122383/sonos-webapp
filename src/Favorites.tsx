// src/components/Favorites.tsx

import React, { useEffect, useState } from 'react';
import { DeskThing, SocketData } from 'deskthing-client';
import './Favorites.css';
export { DeskThing };

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

    const handleFavorite = (socketData: SocketData) => {
      if (socketData.type === 'favorites') {
        setFavorites(socketData.payload);
      }
    };
    const handleZoneGroupState = (socketData: SocketData) => {
      if (socketData.type === 'zoneGroupState') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(socketData.payload, 'text/xml');
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
      }
    };
    const handleSelectedSpeaker = (socketData: SocketData) => {
      if (socketData.type === 'selectedSpeakers' && socketData.payload.uuids) {
        setSelectedSpeakerUUIDs(socketData.payload.uuids);
      }
    };
    // You can also listen for the 'type' with deskthing
    const removeFavoritesListener = DeskThing.on('favorites', handleFavorite)
    const removeZoneGroupStateListener = DeskThing.on('zoneGroupState', handleZoneGroupState)
    const removeSelectedSpeakersListener = DeskThing.on('selectedSpeakers', handleSelectedSpeaker)
    return () => {
      removeFavoritesListener()
      removeZoneGroupStateListener()
      removeSelectedSpeakersListener()
    }
  })

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

      <h2>Will load here</h2>
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
