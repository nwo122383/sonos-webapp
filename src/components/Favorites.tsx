// src/components/Favorites.tsx
//
// Favorites screen with speaker selection and proper art rendering.
// - Normalizes favorites payload so thumbnails show (albumArt | image | thumbnail | artUrl).
// - Keeps your select-all / per-speaker selection logic.
// - Matches your CSS classes: favorites-section, favorites-grid, favorite-item, favorite-title.

import React, { useEffect, useMemo, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './favorites.css';

type FavoriteRaw = any;

type Favorite = {
  uri: string | null;
  title: string;
  albumArt: string | null;
  metaData: string;
  isContainer: boolean;
  id: string;
  browseId: string;
};

type Speaker = {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
};

function extractItemIdFromMetaData(metaData: string): string | null {
  const match = metaData.match(/<item\s+[^>]*\bid="([^"]+)"/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractIPAddress(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function coalesceArt(raw: FavoriteRaw): string | null {
  // Try common fields the server might send
  const art =
    raw?.albumArt ??
    raw?.image ??
    raw?.thumbnail ??
    raw?.artUrl ??
    null;
  return (typeof art === 'string' && art.length > 0) ? art : null;
}

function coalesceTitle(raw: FavoriteRaw): string {
  return String(
    raw?.title ??
    raw?.name ??
    raw?.station ??
    raw?.show ??
    'Unknown'
  );
}

function normalizeFavorite(raw: FavoriteRaw, idx: number): Favorite {
  // Prefer explicit ids; fall back to index string if necessary
  const id =
    String(raw?.id ?? raw?.objectId ?? raw?.itemId ?? idx);
  const meta = String(raw?.metaData ?? raw?.metadata ?? '');
  const browseId =
    extractItemIdFromMetaData(meta) ||
    String(raw?.browseId ?? raw?.objectId ?? raw?.containerId ?? id);

  return {
    id,
    browseId,
    title: coalesceTitle(raw),
    albumArt: coalesceArt(raw),
    uri: raw?.uri ?? null,
    metaData: meta,
    isContainer: !!raw?.isContainer || !raw?.uri, // treat as container if no direct URI
  };
}

const Favorites: React.FC = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerUUIDs, setSelectedSpeakerUUIDs] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Load data
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'favorites' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'zoneGroupState' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedSpeakers' });

    const offFavorites = DeskThing.on('favorites', (data: SocketData) => {
      if (data.type !== 'favorites') return;
      const items = Array.isArray(data.payload) ? data.payload : [];
      const normalized = items.map(normalizeFavorite);
      setFavorites(normalized);
      setLoading(false);
    });

    const offZone = DeskThing.on('zoneGroupState', (data: SocketData) => {
      if (data.type !== 'zoneGroupState') return;
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(String(data.payload || ''), 'text/xml');
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
      } catch {
        // ignore bad XML
      }
    });

    const offSelected = DeskThing.on('selectedSpeakers', (data: SocketData) => {
      if (data.type !== 'selectedSpeakers') return;
      const uuids: string[] = (data.payload && (data.payload as any).uuids) || [];
      if (Array.isArray(uuids)) setSelectedSpeakerUUIDs(uuids);
    });

    return () => {
      offFavorites();
      offZone();
      offSelected();
    };
  }, []);

  const allSelected = useMemo(
    () => speakers.length > 0 && selectedSpeakerUUIDs.length === speakers.length,
    [speakers.length, selectedSpeakerUUIDs.length]
  );

  function toggleSpeaker(uuid: string) {
    setSelectedSpeakerUUIDs((prev) => {
      const next = prev.includes(uuid) ? prev.filter((x) => x !== uuid) : [...prev, uuid];
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'selectSpeakers',
        payload: { uuids: next },
      });
      return next;
    });
  }

  function toggleAll() {
    const all = speakers.map((s) => s.uuid);
    const next = allSelected ? [] : all;
    setSelectedSpeakerUUIDs(next);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'selectSpeakers',
      payload: { uuids: next },
    });
  }

  function handleFavoriteClick(fav: Favorite) {
    if (selectedSpeakerUUIDs.length === 0) {
      alert('Select at least one speaker first.');
      return;
    }

    const coordinator = speakers.find((s) => selectedSpeakerUUIDs.includes(s.uuid));
    const speakerIP = extractIPAddress(coordinator?.location || '');
    if (!speakerIP) {
      alert('Could not resolve a speaker IP.');
      return;
    }

    const isContainer = fav.isContainer || !fav.uri;
    if (isContainer) {
      const objectId = extractItemIdFromMetaData(fav.metaData) || fav.browseId || fav.id;
      if (!objectId) {
        alert('Unable to resolve podcast/show container id.');
        return;
      }
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'set',
        request: 'playLatestFromFavorite',
        payload: {
          objectId,
          speakerIP,
          speakerUUIDs: selectedSpeakerUUIDs,
        },
      });
      return;
    }

    // Non-container: play directly
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'playFavorite',
      payload: {
        uri: fav.uri,
        speakerUUIDs: selectedSpeakerUUIDs,
        metaData: fav.metaData,
      },
    });
  }

  return (
    <div className="favorites-section">
      <div id="favorites-container">
        <h2>Sonos Favorites</h2>

        {/* Speakers */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            onClick={toggleAll}
            className="select-all-button"
            style={{
              border: '1px solid #ccc',
              background: allSelected ? '#222' : '#008cba',
              color: '#fff',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          {speakers.map((sp) => {
            const selected = selectedSpeakerUUIDs.includes(sp.uuid);
            return (
              <button
                key={sp.uuid}
                onClick={() => toggleSpeaker(sp.uuid)}
                className={`select-speaker-button ${selected ? 'selected' : ''}`}
                title={`${sp.zoneName} (${extractIPAddress(sp.location)})`}
              >
                {sp.zoneName}
              </button>
            );
          })}
        </div>

        {/* Favorites grid */}
        <div className="favorites-grid">
          {loading ? (
            <div>Loading…</div>
          ) : favorites.length === 0 ? (
            <div>No favorites found.</div>
          ) : (
            favorites.map((fav) => (
              <div
                key={fav.id}
                className="favorite-item"
                onClick={() => handleFavoriteClick(fav)}
                title={fav.title}
                aria-label={`Play ${fav.title}`}
              >
                {fav.albumArt ? (
                  <img
                    src={fav.albumArt}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 4,
                      background: '#444',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#bbb',
                      border: '1px solid #666',
                    }}
                  >
                    No Art
                  </div>
                )}
                <div className="favorite-title">{fav.title}</div>
                {fav.isContainer && (
                  <div className="play-latest-hint">Show/Podcast • tap to play latest</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Favorites;
