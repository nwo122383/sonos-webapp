// server/sonos/latestEpisode.ts
//
// Adds the ability to resolve and autoplay the **latest episode** from a
// podcast/show favorite container by browsing its children and picking
// the newest by dc:date (fallback keeps original order).
//
// This file is **standalone** but expects to be called with helpers from your existing
// Sonos handler (axios, xml2js, DeskThing, addSpeakerToGroup, getSpeakerIPByUUID,
// playFavorite, playFavoriteOnSpeakers, sendLog, sendError). We inject those via
// the tiny adapter at the bottom.

import xml2js from "xml2js";

export type LatestEpisodeDeps = {
  axiosPost: (url: string, body: string, headers: Record<string, string>) => Promise<{ data: string }>;
  sendLog: (msg: string) => void;
  sendError: (msg: string) => void;
  playFavoriteOnSpeakers: (uri: string, uuids: string[], metaData?: string) => Promise<void>;
};

export class LatestEpisodeService {
  private readonly deps: LatestEpisodeDeps;

  constructor(deps: LatestEpisodeDeps) {
    this.deps = deps;
  }

  /**
   * Browse a favorite container and play its latest episode.
   * @param objectId Sonos ContentDirectory ObjectID for the container
   * @param speakerIP IP of the device used to browse/resolve service URIs
   * @param speakerUUIDs Target speaker UUIDs (coordinator first)
   */
  async playLatestFromFavorite(objectId: string, speakerIP: string, speakerUUIDs: string[]): Promise<void> {
    const soapBody = `
      <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
        <ObjectID>${objectId}</ObjectID>
        <BrowseFlag>BrowseDirectChildren</BrowseFlag>
        <Filter>*</Filter>
        <StartingIndex>0</StartingIndex>
        <RequestedCount>100</RequestedCount>
        <SortCriteria></SortCriteria>
      </u:Browse>`;

    const url = `http://${speakerIP}:1400/MediaServer/ContentDirectory/Control`;
    const headers = {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPACTION': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
    };

    try {
      this.deps.sendLog(`[LatestEpisode] Browsing children of ${objectId} on ${speakerIP}`);

      const resp = await this.deps.axiosPost(
        url,
        `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                    s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>${soapBody}</s:Body>
        </s:Envelope>`,
        headers
      );

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const envelope = await parser.parseStringPromise(resp.data);
      const resultXml =
        envelope?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'] ||
        envelope?.['Envelope']?.['Body']?.['BrowseResponse']?.['Result'] ||
        '';

      if (!resultXml) throw new Error('Empty browse result.');

      const didl = await parser.parseStringPromise(resultXml);
      let items = didl?.['DIDL-Lite']?.item || [];
      if (!Array.isArray(items)) items = items ? [items] : [];

      // Map to normalized episodes with minimal DIDL metadata.
      const builder = new xml2js.Builder({ headless: true, rootName: 'DIDL-Lite' });
      const normalized = items
        .map((it: any) => {
          const res = typeof it?.res === 'object' ? it.res?._ : it?.res;
          const dateStr =
            it?.['dc:date'] ||
            it?.['upnp:originalBroadcastDate'] ||
            '';
          const t = Date.parse(dateStr || '') || 0;
          const meta = builder.buildObject({ item: it });
          return {
            uri: res || null,
            title: it?.['dc:title'] || 'Unknown',
            date: t,
            metaData: meta,
          };
        })
        .filter((x: any) => !!x.uri);

      if (normalized.length === 0) throw new Error('No playable episodes found in this container.');

      normalized.sort((a, b) => b.date - a.date); // newest first (if dates exist)
      const latest = normalized[0];

      await this.deps.playFavoriteOnSpeakers(latest.uri, speakerUUIDs, latest.metaData);
      this.deps.sendLog(`[LatestEpisode] Playing latest episode: ${latest.title}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to resolve latest episode.';
      this.deps.sendError(`[LatestEpisode] ${msg}`);
      throw err;
    }
  }
}

/**
 * Lightweight adapter to create the service from your existing sonos handler object.
 */
export function createLatestEpisodeService(handler: {
  sendLog: (m: string) => void;
  sendError: (m: string) => void;
  playFavoriteOnSpeakers: (uri: string, uuids: string[], meta?: string) => Promise<void>;
  axios: { post: (url: string, data: string, config: { headers: Record<string, string> }) => Promise<{ data: string }> };
}): LatestEpisodeService {
  return new LatestEpisodeService({
    axiosPost: (url, body, headers) => handler.axios.post(url, body, { headers }),
    sendLog: handler.sendLog.bind(handler),
    sendError: handler.sendError.bind(handler),
    playFavoriteOnSpeakers: handler.playFavoriteOnSpeakers.bind(handler),
  });
}