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
  objectId?: string;
};

type BrowseItem = {
  uri: string | null;
  title: string;
  albumArt: string | null;
  metaData: string;
  isContainer: boolean;
  id: string;
  browseId: string;
  releaseDate?: string | null;
};

type EpisodeBrowserState = {
  open: boolean;
  favoriteTitle: string;
  speakerUUIDs: string[];
  speakerIP: string;
  currentObjectId: string;
  items: BrowseItem[];
  loading: boolean;
  error: string | null;
  breadcrumbs: { title: string; objectId: string }[];
};

type Speaker = {
  uuid: string;
  location: string;
  zoneName: string;
  isCoordinator: boolean;
  groupId: string;
};

function extractItemIdFromMetaData(metaData: string): string | null {
  if (!metaData) return null;
  const objectIdMatch = metaData.match(/<r:objectId[^>]*>([^<]+)<\/r:objectId>/i);
  if (objectIdMatch?.[1]) return objectIdMatch[1];
  const unescaped = metaData.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const escapedObjectIdMatch = unescaped.match(/<r:objectId[^>]*>([^<]+)<\/r:objectId>/i);
  if (escapedObjectIdMatch?.[1]) return escapedObjectIdMatch[1];
  const itemIdMatch = metaData.match(/<item\s+[^>]*\bid="([^"]+)"/i);
  if (itemIdMatch?.[1]) return itemIdMatch[1];
  const escapedItemIdMatch = unescaped.match(/<item\s+[^>]*\bid="([^"]+)"/i);
  return escapedItemIdMatch?.[1] || null;
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
  const objectId = String(raw?.objectId ?? browseId ?? id);

  return {
    id,
    browseId,
    objectId,
    title: coalesceTitle(raw),
    albumArt: coalesceArt(raw),
    uri: raw?.uri ?? null,
    metaData: meta,
    isContainer: !!raw?.isContainer || !raw?.uri, // treat as container if no direct URI
  };
}

function idsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    if (decodeURIComponent(a) === b) return true;
  } catch {
    /* noop */
  }
  try {
    if (decodeURIComponent(b) === a) return true;
  } catch {
    /* noop */
  }
  return false;
}

const Favorites: React.FC = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakerUUIDs, setSelectedSpeakerUUIDs] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [episodeBrowser, setEpisodeBrowser] = useState<EpisodeBrowserState | null>(null);

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

    const offBrowseResults = DeskThing.on('browseFavoriteResults', (data: SocketData) => {
      if (data.type !== 'browseFavoriteResults') return;
      const payload = (data as any).payload || {};
      setEpisodeBrowser((prev) => {
        if (!prev || !prev.open) return prev;
        const payloadId: string | undefined = payload.objectId;
        if (payloadId && !idsMatch(payloadId, prev.currentObjectId) && payloadId !== prev.currentObjectId) {
          return prev;
        }
        const items = Array.isArray(payload.items) ? (payload.items as BrowseItem[]) : [];
        return {
          ...prev,
          loading: false,
          error: null,
          items,
          currentObjectId: payloadId || prev.currentObjectId,
        };
      });
    });

    const offBrowseError = DeskThing.on('browseFavoriteError', (data: SocketData) => {
      if (data.type !== 'browseFavoriteError') return;
      const payload = (data as any).payload || {};
      setEpisodeBrowser((prev) => {
        if (!prev || !prev.open) return prev;
        const payloadId: string | undefined = payload.objectId;
        if (payloadId && !idsMatch(payloadId, prev.currentObjectId) && payloadId !== prev.currentObjectId) {
          return prev;
        }
        return {
          ...prev,
          loading: false,
          error: payload.message || 'Unable to load episodes.',
        };
      });
    });

    return () => {
      offFavorites();
      offZone();
      offSelected();
      offBrowseResults();
      offBrowseError();
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

  function sendBrowseRequest(objectId: string, speakerIP: string) {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'get',
      request: 'browseFavorite',
      payload: { objectId, speakerIP },
    });
  }

  function formatReleaseDate(input?: string | null): string | null {
    if (!input) return null;
    const ts = Date.parse(input);
    if (!Number.isNaN(ts)) {
      return new Date(ts).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return input;
  }

  function triggerPlayLatest(objectId: string, speakerUUIDs: string[], speakerIP: string) {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'playLatestFromFavorite',
      payload: { objectId, speakerUUIDs, speakerIP },
    });
  }

  function openEpisodeSelection(fav: Favorite, objectId: string, speakerIP: string, speakerUUIDs: string[]) {
    setEpisodeBrowser({
      open: true,
      favoriteTitle: fav.title,
      speakerUUIDs,
      speakerIP,
      currentObjectId: objectId,
      items: [],
      loading: true,
      error: null,
      breadcrumbs: [{ title: fav.title, objectId }],
    });
    sendBrowseRequest(objectId, speakerIP);
  }

  function closeEpisodeBrowser() {
    setEpisodeBrowser(null);
  }

  function browseIntoContainer(item: BrowseItem) {
    if (!episodeBrowser) return;
    const nextObjectId = item.browseId || item.id;
    if (!nextObjectId) return;
    setEpisodeBrowser({
      ...episodeBrowser,
      currentObjectId: nextObjectId,
      breadcrumbs: [...episodeBrowser.breadcrumbs, { title: item.title || 'Container', objectId: nextObjectId }],
      loading: true,
      error: null,
      items: [],
    });
    sendBrowseRequest(nextObjectId, episodeBrowser.speakerIP);
  }

  function handleBreadcrumbClick(index: number) {
    if (!episodeBrowser) return;
    if (index < 0 || index >= episodeBrowser.breadcrumbs.length) return;
    const crumb = episodeBrowser.breadcrumbs[index];
    if (!crumb || crumb.objectId === episodeBrowser.currentObjectId) return;
    setEpisodeBrowser({
      ...episodeBrowser,
      currentObjectId: crumb.objectId,
      breadcrumbs: episodeBrowser.breadcrumbs.slice(0, index + 1),
      loading: true,
      error: null,
      items: [],
    });
    sendBrowseRequest(crumb.objectId, episodeBrowser.speakerIP);
  }

  function handlePlayEpisode(item: BrowseItem) {
    if (!episodeBrowser) return;
    if (!item.uri) {
      alert('Selected episode did not include a playable URI.');
      return;
    }
    if (!item.metaData) {
      alert('Missing metadata for this episode. Try playing the latest episode instead.');
      return;
    }
    if (!episodeBrowser.speakerUUIDs.length) {
      alert('Select at least one speaker first.');
      return;
    }
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'playFavorite',
      payload: {
        uri: item.uri,
        metaData: item.metaData,
        speakerUUIDs: episodeBrowser.speakerUUIDs,
      },
    });
    closeEpisodeBrowser();
  }

  function handlePlayLatestFromBrowser() {
    if (!episodeBrowser) return;
    const rootObjectId = episodeBrowser.breadcrumbs[0]?.objectId;
    if (!rootObjectId) return;
    triggerPlayLatest(rootObjectId, episodeBrowser.speakerUUIDs, episodeBrowser.speakerIP);
    closeEpisodeBrowser();
  }

  function handleFavoriteClick(fav: Favorite) {
    if (selectedSpeakerUUIDs.length === 0) {
      alert('Select at least one speaker first.');
      return;
    }

    const speakerUUIDs = selectedSpeakerUUIDs.slice();
    const coordinator = speakers.find((s) => selectedSpeakerUUIDs.includes(s.uuid));
    const speakerIP = extractIPAddress(coordinator?.location || '');
    if (!speakerIP) {
      alert('Could not resolve a speaker IP.');
      return;
    }

    const isContainer = fav.isContainer || !fav.uri;
    if (isContainer) {
      const objectId = fav.objectId || extractItemIdFromMetaData(fav.metaData) || fav.browseId || fav.id;
      if (!objectId) {
        alert('Unable to resolve podcast/show container id.');
        return;
      }
      openEpisodeSelection(fav, objectId, speakerIP, speakerUUIDs);
      return;
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'playFavorite',
      payload: {
        uri: fav.uri,
        speakerUUIDs,
        metaData: fav.metaData,
      },
    });
  }

  return (
    <>
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
                    <div className="play-latest-hint">Show/Podcast • browse episodes</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {episodeBrowser?.open && (
        <div className="episode-modal-backdrop" role="dialog" aria-modal="true">
          <div className="episode-modal">
            <div className="episode-modal-header">
              <div>
                <div className="episode-modal-title">{episodeBrowser.favoriteTitle}</div>
                <div className="episode-breadcrumbs">
                  {episodeBrowser.breadcrumbs.map((crumb, idx) => (
                    <span key={`${crumb.objectId}-${idx}`} className="episode-breadcrumb">
                      {idx === episodeBrowser.breadcrumbs.length - 1 ? (
                        <span>{crumb.title}</span>
                      ) : (
                        <button type="button" onClick={() => handleBreadcrumbClick(idx)}>
                          {crumb.title}
                        </button>
                      )}
                      {idx < episodeBrowser.breadcrumbs.length - 1 && (
                        <span className="episode-breadcrumb-sep">/</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <button className="episode-close" onClick={closeEpisodeBrowser}>
                Close
              </button>
            </div>

            {episodeBrowser.error && <div className="episode-error">{episodeBrowser.error}</div>}

            {episodeBrowser.loading ? (
              <div className="episode-loading">Loading episodes…</div>
            ) : episodeBrowser.items.length === 0 ? (
              <div className="episode-empty">
                <p>No episodes returned for this selection.</p>
                <button onClick={handlePlayLatestFromBrowser}>Play Latest Episode</button>
              </div>
            ) : (
              <div className="episode-list">
                {episodeBrowser.items.map((item) => {
                  const release = !item.isContainer ? formatReleaseDate(item.releaseDate || null) : null;
                  return (
                    <button
                      key={`${item.browseId || item.id || item.title}`}
                      className="episode-row"
                      onClick={() => (item.isContainer ? browseIntoContainer(item) : handlePlayEpisode(item))}
                    >
                      {item.albumArt ? (
                        <img src={item.albumArt} alt="" />
                      ) : (
                        <div className="episode-art-placeholder">No Art</div>
                      )}
                      <div className="episode-row-body">
                        <div className="episode-row-title">{item.title}</div>
                        <div className="episode-row-meta">
                          {item.isContainer ? 'Browse' : release || 'Episode'}
                        </div>
                      </div>
                      <div className="episode-row-action">{item.isContainer ? 'Open' : 'Play'}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="episode-modal-footer">
              <button onClick={handlePlayLatestFromBrowser}>Play Latest Episode</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Favorites;
