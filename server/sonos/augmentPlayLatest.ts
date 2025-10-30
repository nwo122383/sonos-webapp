// server/sonos/augmentPlayLatest.ts
// Safely augments the existing default-exported Sonos handler INSTANCE with
// a new method: playLatestFromFavorite(objectId, speakerIP, speakerUUIDs).
// No changes required to your current sonos handler code.

import axios from 'axios';
import xml2js from 'xml2js';
import sonos from '.'; // IMPORTANT: this must import the same instance used elsewhere

type SonosLike = {
  sendLog: (m: string) => void;
  sendError: (m: string) => void;
  playFavoriteOnSpeakers: (uri: string, uuids: string[], metaData?: string) => Promise<void>;
};

async function playLatestFromFavoriteImpl(
  this: SonosLike,
  objectId: string,
  speakerIP: string,
  speakerUUIDs: string[]
) {
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
    this.sendLog(`[augmentPlayLatest] Browsing children of ${objectId} on ${speakerIP}`);

    const resp = await axios.post(
      url,
      `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>${soapBody}</s:Body>
      </s:Envelope>`,
      { headers }
    );

    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const envelope = await parser.parseStringPromise(resp.data);
    const resultXml =
      envelope?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'] ||
      envelope?.['Envelope']?.['Body']?.['BrowseResponse']?.['Result'] ||
      '';

    if (!resultXml) throw new Error('Empty browse result.');

    const didl = await parser.parseStringPromise(resultXml);
    let items: any[] = didl?.['DIDL-Lite']?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];

    const builder = new xml2js.Builder({ headless: true, rootName: 'DIDL-Lite' });
    const normalized = items
      .map((it: any) => {
        const res = typeof it?.res === 'object' ? it.res?._ : it?.res;
        const dateStr = it?.['dc:date'] || it?.['upnp:originalBroadcastDate'] || '';
        const t = Date.parse(dateStr || '') || 0;
        const meta = builder.buildObject({ item: it });
        return { uri: res || null, title: it?.['dc:title'] || 'Unknown', date: t, metaData: meta };
      })
      .filter((x: any) => !!x.uri);

    if (normalized.length === 0) throw new Error('No playable episodes found in this container.');

    normalized.sort((a, b) => b.date - a.date);
    const latest = normalized[0];

    await this.playFavoriteOnSpeakers(latest.uri, speakerUUIDs, latest.metaData);
    this.sendLog(`[augmentPlayLatest] Playing latest episode: ${latest.title}`);
  } catch (err: any) {
    const msg = err?.message || 'Failed to resolve latest episode.';
    this.sendError(`[augmentPlayLatest] ${msg}`);
    throw err;
  }
}

// Attach only if missing (avoids double-definition on hot reloads)
const anySonos = sonos as any;
if (typeof anySonos.playLatestFromFavorite !== 'function') {
  anySonos.playLatestFromFavorite = playLatestFromFavoriteImpl.bind(sonos);
}

export {}; // module side-effect only
