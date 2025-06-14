// src/components/Favorites.tsx

import React, { useEffect, useState } from 'react';
import { DeskThing, SocketData } from '@deskthing/client';
import './Favorites.css';
import FavoriteModal from './FavoriteModal';

export interface Favorite {
  uri: string | null;
  title: string;
  albumArt: string | null;
  metaData: string;
  isContainer: boolean;
  id: string;
  browseId: string;
}

interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
}

function extractItemIdFromMetaData(metaData: string): string | null {
  const match = metaData.match(/<item id="([^"]+)"/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractIPAddress(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const Favorites = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerUUIDs, setSelectedSpeakerUUIDs] = useState<string[]>([]);
  const [modalItems, setModalItems] = useState<Favorite[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'favorites' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'zoneGroupState' });

    const handleFavorite = (data: SocketData) => {
      if (data.type === 'favorites') setFavorites(data.payload);
    };

    const handleZoneGroupState = (data: SocketData) => {
      if (data.type !== 'zoneGroupState') return;
      const parser = new DOMParser();
      const xml = parser.parseFromString(data.payload, 'text/xml');
      const groups = Array.from(xml.getElementsByTagName('ZoneGroup'));
      const all: Speaker[] = [];

      groups.forEach((group) => {
        const coordinator = group.getAttribute('Coordinator');
        const groupId = group.getAttribute('ID') || '';
        const members = Array.from(group.getElementsByTagName('ZoneGroupMember'));
        members.forEach((m) => {
          all.push({
            uuid: m.getAttribute('UUID') || '',
            location: m.getAttribute('Location') || '',
            zoneName: m.getAttribute('ZoneName') || '',
            isCoordinator: m.getAttribute('UUID') === coordinator,
            groupId,
          });
        });
      });

      setSpeakers(all);
    };

    const handleSelectedSpeakers = (data: SocketData) => {
      if (data.type === 'selectedSpeakers' && data.payload.uuids) {
        setSelectedSpeakerUUIDs(data.payload.uuids);
      }
    };

    const handleBrowseResults = (() => {
      let lastAlertTime = 0;

      return (data: SocketData) => {
        if (data.type !== 'browseFavoriteResults') return;

        console.log('[Favorites] Received browseFavoriteResults:', data.payload);

        if (Array.isArray(data.payload) && data.payload.length > 0) {
          setModalItems(data.payload);
          setShowModal(true);
        } else {
          const now = Date.now();
          if (now - lastAlertTime > 3000) {
            alert('No items found in this favorite. It may not be playable.');
            lastAlertTime = now;
          }
        }
      };
    })();

    const off1 = DeskThing.on('favorites', handleFavorite);
    const off2 = DeskThing.on('zoneGroupState', handleZoneGroupState);
    const off3 = DeskThing.on('selectedSpeakers', handleSelectedSpeakers);
    const off4 = DeskThing.on('browseFavoriteResults', handleBrowseResults);
    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, []);

  const selectSpeaker = (uuid: string) => {
    setSelectedSpeakerUUIDs((prev) => {
      const updated = prev.includes(uuid)
        ? prev.filter((id) => id !== uuid)
        : [...prev, uuid];

      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'selectSpeakers',
        payload: { uuids: updated },
      });

      return updated;
    });
  };

  const handleFavoriteClick = (favorite: Favorite) => {
    if (selectedSpeakerUUIDs.length === 0) {
      alert('Please select at least one speaker.');
      return;
    }

    const speaker = speakers.find((s) => selectedSpeakerUUIDs.includes(s.uuid));
    const speakerIP = extractIPAddress(speaker?.location || '');
    const objectId = extractItemIdFromMetaData(favorite.metaData) || favorite.browseId || favorite.id;

    if (!speakerIP) {
      console.warn('No valid speaker IP found');
      return;
    }

    if (!favorite.uri) {
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'browseFavorite',
        payload: { objectId, speakerIP },
      });
    } else {
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'playFavorite',
        payload: {
          uri: favorite.uri,
          speakerUUIDs: selectedSpeakerUUIDs,
          metaData: favorite.metaData,
        },
      });
    }
  };

  return (
    <div id="favorites-container">
      <h2>Select speaker to play favorites on</h2>
      <button
        className="select-all-button"
        onClick={() => {
          const all = speakers.map((s) => s.uuid);
          const next = selectedSpeakerUUIDs.length === all.length ? [] : all;
          setSelectedSpeakerUUIDs(next);
          DeskThing.send({
            app: 'sonos-webapp',
            type: 'set',
            request: 'selectSpeakers',
            payload: { uuids: next },
          });
        }}
      >
        {selectedSpeakerUUIDs.length === speakers.length ? 'Deselect All Speakers' : 'Select All Speakers'}
      </button>

      <div className="speakers-list">
        {speakers.map((speaker, i) => {
          const selected = selectedSpeakerUUIDs.includes(speaker.uuid);
          return (
            <div key={i} className={`speaker-item ${selected ? 'selected' : ''}`}>
              <div className="speaker-info">
                <strong>{speaker.zoneName}</strong> - {extractIPAddress(speaker.location)}
              </div>
              <div className="speaker-controls">
                <button
                  onClick={() => selectSpeaker(speaker.uuid)}
                  className={`select-speaker-button ${selected ? 'selected' : ''}`}
                >
                  {selected ? `Selected: ${speaker.zoneName}` : `Select Speaker: ${speaker.zoneName}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h2>Favorites</h2>
      <div className="favorites-grid">
        {favorites.map((f) => (
          <div key={f.id} className="favorite-item" onClick={() => handleFavoriteClick(f)}>
            <img src={f.albumArt || 'default-image.jpg'} alt="Album Art" />
            <div>{f.title}</div>
          </div>
        ))}
      </div>

      {showModal && (
        <FavoriteModal
          items={modalItems}
          onClose={() => setShowModal(false)}
          onPlay={(fav) => handleFavoriteClick(fav)}
          onBrowse={(fav) => {
            const speaker = speakers.find((s) => selectedSpeakerUUIDs.includes(s.uuid));
            const speakerIP = extractIPAddress(speaker?.location || '');
            const objectId = extractItemIdFromMetaData(fav.metaData) || fav.browseId || fav.id;

            if (!speakerIP) {
              console.warn('No speaker IP found for browsing container');
              return;
            }

            DeskThing.send({
              app: 'sonos-webapp',
              type: 'set',
              request: 'browseFavorite',
              payload: { objectId, speakerIP },
            });
          }}
        />
      )}

      <div className="debug-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '30px' }}>
        {favorites.map((fav, i) => {
          const id = extractItemIdFromMetaData(fav.metaData) || fav.browseId || fav.id;
          const speakerIP = extractIPAddress(speakers.find((s) => selectedSpeakerUUIDs.includes(s.uuid))?.location || '');
          return (
            <div key={i} style={{ flex: '1 1 300px' }}>
              <div style={{ fontSize: '0.8em', marginBottom: '4px' }}>{fav.title}</div>
              {['', 'S:', 'A:', 'A:10fe2064show:', 'FV:2/'].map((prefix, j) => (
                <button
                  key={j}
                  style={{ padding: '8px', width: '100%', background: '#222', color: '#fff' }}
                  onClick={() =>
                    DeskThing.send({
                      app: 'sonos-webapp',
                      type: 'set',
                      request: 'browseFavorite',
                      payload: { objectId: prefix + id, speakerIP },
                    })
                  }
                >
                  Format {j + 1} ({prefix || 'raw'})
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Favorites;
