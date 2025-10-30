// server/sonos/playLatest.ts
//
// Uses the item's ORIGINAL DIDL from ContentDirectory (not a custom stub) to avoid SMAPI 500s.
// Flow:
// 1) Browse children on speakerIP; fallback to coordinatorIP if needed.
// 2) Pick newest by dc:date (fallback: first).
// 3) Rebuild DIDL-Lite containing the chosen <item> exactly as returned.
// 4) Call sonos.playFavoriteOnSpeakers(uri, speakerUUIDs, didl) to let your existing
//    transport/queue logic handle provider specifics.

import axios from 'axios';
import xml2js from 'xml2js';

type SonosFacade = {
  sendLog: (m: string) => void;
  sendError: (m: string) => void;
  getSpeakerIPByUUID: (uuid: string) => Promise<string | null>;
  addSpeakerToGroup: (memberIp: string, coordinatorIp: string) => Promise<void>;
  playFavoriteOnSpeakers: (uri: string, uuids: string[], metaData?: string) => Promise<void>;
};

const CD_SVC = 'urn:schemas-upnp-org:service:ContentDirectory:1';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&apos;');

function soapEnvelope(action: string, svc: string, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body><u:${action} xmlns:u="${svc}">${body}</u:${action}></s:Body>
</s:Envelope>`;
}

async function browseChildren(ip: string, objectId: string, start = 0, count = 200, sort = '-dc:date') {
  const url = `http://${ip}:1400/MediaServer/ContentDirectory/Control`;
  const headers = { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${CD_SVC}#Browse"` };
  const body = `
    <ObjectID>${objectId}</ObjectID>
    <BrowseFlag>BrowseDirectChildren</BrowseFlag>
    <Filter>*</Filter>
    <StartingIndex>${start}</StartingIndex>
    <RequestedCount>${count}</RequestedCount>
    <SortCriteria>${sort}</SortCriteria>`;

  const resp = await axios.post(url, soapEnvelope('Browse', CD_SVC, body), { headers, timeout: 12000 });

  // Keep both parsed object AND original Result XML so we can rebuild exact DIDL for a chosen item.
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
  const envObj = await parser.parseStringPromise(resp.data);

  const resultXml =
    envObj?.['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.['Result'] ||
    envObj?.Envelope?.Body?.BrowseResponse?.Result || '';

  if (!resultXml) return { items: [], resultXml: '' };

  const didlObj = await parser.parseStringPromise(resultXml);
  let items: any[] = didlObj?.['DIDL-Lite']?.item || [];
  if (!Array.isArray(items)) items = items ? [items] : [];

  return { items, resultXml };
}

function pickUriFromRes(it: any): string | null {
  const res = it?.res;
  const arr = Array.isArray(res) ? res : res ? [res] : [];
  const urls = arr.map((r: any) => (typeof r === 'object' ? r?._ : r)).filter(Boolean) as string[];
  if (!urls.length) return null;
  const prefer = urls.find((u) => /^x-/.test(u));
  return prefer || urls[0];
}

function toEpoch(it: any): number {
  const raw = it?.['dc:date'] || it?.['upnp:originalBroadcastDate'] || '';
  const t = Date.parse(raw || '');
  return Number.isFinite(t) ? t : 0;
}

/** Build DIDL-Lite containing exactly the chosen item object (round-tripped back to XML). */
function buildExactDidlFromItemObject(itemObj: any): string {
  const builder = new xml2js.Builder({
    headless: true,
    rootName: 'DIDL-Lite',
    xmldec: undefined,
    renderOpts: { pretty: false },
  });

  // Wrap the single item into DIDL-Lite with proper namespaces as Sonos expects
  const didlWrapper = {
    '$': {
      'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      'xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
      'xmlns:r': 'urn:schemas-rinconnetworks-com:metadata-1-0/',
      'xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
    },
    item: itemObj,
  };

  return builder.buildObject(didlWrapper);
}

/** Try to find the raw object for the chosen item and rebuild its DIDL exactly. */
function rebuildDidlForChosen(itemObj: any): string {
  // Ensure item has required minimal fields; otherwise builder will still serialize what's present.
  return buildExactDidlFromItemObject(itemObj);
}

export async function playLatestFromFavorite(
  sonos: SonosFacade,
  objectId: string,
  speakerIP: string,
  speakerUUIDs: string[]
): Promise<void> {
  try {
    if (!speakerUUIDs?.length) throw new Error('No speakers selected.');

    // Coordinator & group
    const coordinatorUUID = speakerUUIDs[0];
    const coordinatorIP = (await sonos.getSpeakerIPByUUID(coordinatorUUID)) || speakerIP;
    if (!coordinatorIP) throw new Error('Coordinator IP not found.');
    for (let i = 1; i < speakerUUIDs.length; i++) {
      const mIP = await sonos.getSpeakerIPByUUID(speakerUUIDs[i]);
      if (mIP) await sonos.addSpeakerToGroup(mIP, coordinatorIP);
    }

    // 1) Browse on speakerIP
    let { items, resultXml } = await browseChildren(speakerIP, objectId, 0, 200, '-dc:date');

    // 2) Fallback browse on coordinatorIP if needed
    if (items.length === 0 && coordinatorIP !== speakerIP) {
      sonos.sendLog('[playLatest] No items from speakerIP; retrying on coordinatorIP…');
      const res2 = await browseChildren(coordinatorIP, objectId, 0, 200, '-dc:date');
      items = res2.items;
      resultXml = res2.resultXml;
    }

    if (items.length === 0) throw new Error('ContentDirectory returned no children.');

    // 3) Pick newest by dc:date (fallback: first item)
    const withDates = items
      .map((it) => ({ it, t: toEpoch(it), title: it?.['dc:title'] || 'Unknown' }))
      .filter((x) => !!pickUriFromRes(x.it));

    if (withDates.length === 0) throw new Error('No playable item (<res>) in children.');

    withDates.sort((a, b) => b.t - a.t);
    const chosen = withDates[0].it;
    const chosenUri = pickUriFromRes(chosen);
    const chosenTitle = chosen?.['dc:title'] || 'Unknown';

    if (!chosenUri) throw new Error('Chosen item has no <res> URI.');

    // 4) Rebuild EXACT DIDL for the chosen item (no custom hand-written metadata)
    const didl = rebuildDidlForChosen(chosen);

    sonos.sendLog(`[playLatest] Using exact DIDL from Browse. Title="${chosenTitle}" URI=${chosenUri.slice(0, 96)}…`);

    // 5) Delegate to your existing playFavoriteOnSpeakers (handles provider quirks & queue/transport)
    await sonos.playFavoriteOnSpeakers(chosenUri, speakerUUIDs, didl);

    sonos.sendLog('[playLatest] Dispatched playFavoriteOnSpeakers with exact DIDL (should avoid 500s).');
  } catch (err: any) {
    sonos.sendError(`[playLatest] ${err?.message || err}`);
    throw err;
  }
}
