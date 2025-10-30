// server/siriusApi.ts
// Full drop-in: best-effort SiriusXM web API fallback that returns items
// shaped like BrowseResultItem (with metaData and optional pubDate).

import type { BrowseResultItem } from "./browseSmart";

const fetchFn: typeof fetch = (globalThis as any).fetch;

// NOTE: SiriusXM changes endpoints often. This module is "best-effort":
// 1) Try podcast search endpoint for shows/podcasts.
// 2) Fetch latest episodes for that show.
// 3) Synthesize DIDL for Sonos using standard fields.

const BASE = "https://player.siriusxm.com/rest/v4/experience";

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function didlForEpisode(ep: {
  id: string;
  title: string;
  uri: string;
  albumArt?: string | null;
  pubDate?: string | null;
}): string {
  const title = xmlEscape(ep.title || 'Episode');
  const res = xmlEscape(ep.uri);
  const art = ep.albumArt ? `<upnp:albumArtURI>${xmlEscape(ep.albumArt)}</upnp:albumArtURI>` : '';
  const date = ep.pubDate ? `<dc:date>${xmlEscape(ep.pubDate)}</dc:date>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"
           xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="${xmlEscape(ep.id)}" parentID="${xmlEscape(ep.id)}" restricted="true">
    <dc:title>${title}</dc:title>
    ${date}
    ${art}
    <upnp:class>object.item.audioItem.musicTrack</upnp:class>
    <res protocolInfo="http-get:*:audio/mpeg:*">${res}</res>
  </item>
</DIDL-Lite>`;
}

// Extremely loose search — this may return nothing depending on SXM’s current API.
// We keep it resilient: if anything fails, just return [] so upstream can fall back.
async function searchPodcastId(showTitle: string): Promise<string | null> {
  const url = `${BASE}/modules/get?component=podcastSearch&query=${encodeURIComponent(showTitle)}`;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const json = await res.json();
    const id = json?.ModuleList?.modules?.[0]?.podcast?.id ?? null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

async function fetchPodcastEpisodes(podcastId: string): Promise<Array<{ id: string; title: string; audioUrl: string; image?: string | null; pubDate?: string | null }>> {
  // WARNING: The real endpoint frequently changes. This is a resilient placeholder
  // that tries a couple of common SXM shapes and returns [] if none match.
  const urls = [
    `${BASE}/podcast/episodes?podcastId=${encodeURIComponent(podcastId)}&limit=25`,
    `${BASE}/podcast/episodes?limit=25&podcastId=${encodeURIComponent(podcastId)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const json = await res.json();
      const list = json?.episodes || json?.items || json?.data || [];
      const mapped = list
        .map((e: any) => {
          const id = e?.id ?? e?.guid ?? e?.episodeId ?? null;
          const title = e?.title ?? e?.name ?? null;
          const audioUrl = e?.audioUrl ?? e?.audio?.url ?? e?.streamUrl ?? null;
          const image = e?.imageUrl ?? e?.image ?? e?.coverArt ?? null;
          const pubDate = e?.pubDate ?? e?.published ?? e?.date ?? null;
          if (!id || !title || !audioUrl) return null;
          return { id: String(id), title: String(title), audioUrl: String(audioUrl), image: image ? String(image) : null, pubDate: pubDate ? String(pubDate) : null };
        })
        .filter(Boolean);
      if (mapped.length) return mapped as any;
    } catch {
      // try next
    }
  }
  return [];
}

/**
 * Public: attempt to get latest episodes by show title.
 * Returns normalized BrowseResultItem[] suitable for browseFavoriteSmart fallback.
 */
export async function getSiriusXMEpisodes(showTitle: string): Promise<BrowseResultItem[]> {
  const podcastId = await searchPodcastId(showTitle);
  if (!podcastId) return [];
  const eps = await fetchPodcastEpisodes(podcastId);
  return eps.map((e) => ({
    id: e.id,
    browseId: e.id,
    title: e.title,
    albumArt: e.image || null,
    uri: e.audioUrl,
    isContainer: false,
    metaData: didlForEpisode({
      id: e.id,
      title: e.title,
      uri: e.audioUrl,
      albumArt: e.image,
      pubDate: e.pubDate || null,
    }),
    pubDate: e.pubDate || null,
  }));
}
