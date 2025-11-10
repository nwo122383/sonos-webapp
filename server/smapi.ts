// server/smapi.ts
//
// SMAPI (MusicServices) browse for shows/podcasts (e.g., SiriusXM).
// Uses /MusicServices/Control getMetadata and normalizes to your app's Favorite[] shape.
//
// Exports:
//   browseSmapi({ speakerIP, objectId, metaData }): Promise<FavoriteItem[]>
//
// FavoriteItem shape matches your UI expectations:
//   { id, browseId, title, albumArt, uri, isContainer, metaData }

import http from 'http';
import { parseStringPromise } from 'xml2js';

export interface FavoriteItem {
  id: string;
  browseId: string;
  title: string;
  albumArt: string | null;
  uri: string | null;
  isContainer: boolean;
  metaData: string;
}

function httpPost(ip: string, path: string, soapAction: string, body: string): Promise<string> {
  const payload = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
${body}
  </s:Body>
</s:Envelope>`;

  const options: http.RequestOptions = {
    host: ip,
    port: 1400,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPACTION': `"${soapAction}"`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          const err = new Error(`SMAPI HTTP ${res.statusCode}: ${data.slice(0, 400)}`);
          (err as any).response = data;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Pull service id like "9479" from a DIDL <desc> ... Svc9479-0-Token */
export function extractServiceIdFromMeta(metaData: string): string | null {
  const m = metaData.match(/Svc(\d+)-/);
  return m ? m[1] : null;
}

function buildGetMetadataBody(serviceId: string, objectId: string, index = 0, count = 100) {
  // Namespace for v1.1 SMAPI (works for getMetadata on modern Sonos)
  return `
<u:getMetadata xmlns:u="http://www.sonos.com/Services/1.1">
  <id>${escapeXml(objectId)}</id>
  <index>${index}</index>
  <count>${count}</count>
  <recursive>false</recursive>
  <cachePolicy>cache</cachePolicy>
  <tradeItemId></tradeItemId>
  <serviceId>${serviceId}</serviceId>
</u:getMetadata>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absolutizeAlbumArt(ip: string, maybe: string | undefined): string | null {
  if (!maybe) return null;
  if (/^https?:\/\//i.test(maybe)) return maybe;
  if (maybe.startsWith('/')) return `http://${ip}:1400${maybe}`;
  return maybe;
}

function toFavoriteItem(ip: string, item: any, rawMeta: string): FavoriteItem {
  // Handle both container and item shapes
  const id = (item.$?.id ?? item.id?.[0] ?? '').toString();
  const title = (item['dc:title']?.[0] ?? item.title?.[0] ?? 'Unknown Title').toString();

  // album art may appear as <upnp:albumArtURI>...</upnp:albumArtURI>
  const art = item['upnp:albumArtURI']?.[0] ?? item.albumArtURI?.[0] ?? null;
  const albumArt = absolutizeAlbumArt(ip, art || undefined);

  // playable uri: <res>...</res>
  const res = item.res?.[0] ?? null;

  // class (container vs track/episode)
  const klass = (item['upnp:class']?.[0] ?? item.class?.[0] ?? '').toString();
  const isContainer = /^object\.container/i.test(klass);

  return {
    id,
    browseId: id,
    title,
    albumArt,
    uri: isContainer ? null : res,
    isContainer,
    metaData: rawMeta, // pass through the original DIDL we already have
  };
}

/** Parse SMAPI getMetadata response (Result contains DIDL-Lite) */
async function parseSmapiGetMetadataResponse(ip: string, xml: string, rawMeta: string): Promise<FavoriteItem[]> {
  const env = await parseStringPromise(xml, { explicitArray: true, explicitRoot: true });
  // get `<Result>` in getMetadataResponse
  const result =
    env?.['s:Envelope']?.['s:Body']?.[0]?.['u:getMetadataResponse']?.[0]?.['Result']?.[0] ??
    env?.['s:Envelope']?.['s:Body']?.[0]?.['getMetadataResponse']?.[0]?.['Result']?.[0] ??
    '';

  if (!result) return [];

  const didl = await parseStringPromise(result, { explicitArray: true, explicitRoot: true });
  const container = didl?.['DIDL-Lite'] ?? didl?.DIDL ?? didl;

  const items: any[] = [
    ...(container?.item ?? []),
    ...(container?.container ?? []),
  ];

  return items.map((it) => toFavoriteItem(ip, it, rawMeta));
}

/**
 * Try to browse a show/podcast via SMAPI (MusicServices).
 *
 * @param speakerIP - the Sonos player IP (e.g., 192.168.x.x)
 * @param objectId  - the content id, e.g. "10fe2064show%3Aabc...". MUST be already percent-encoded; do NOT decode.
 * @param metaData  - DIDL that includes the <desc> with service id ("Svc####")
 */
export async function browseSmapi(params: { speakerIP: string; objectId: string; metaData?: string; accountId?: string | null }): Promise<FavoriteItem[]> {
  const { speakerIP, objectId, metaData = '', accountId } = params;

  const serviceId = extractServiceIdFromMeta(metaData);
  if (!serviceId) {
    // No service id -> cannot do SMAPI browse
    return [];
  }

  const soapAction = 'urn:schemas-upnp-org:service:MusicServices:1#X_GetMetadata'; // wrapper action used by Sonos
  // Many stacks accept getMetadata with music services wrapper; if needed, fallback to Services/1.1
  const accountFragment = accountId ? `<AccountId>${accountId}</AccountId>` : '';
  const body = `
<u:X_GetMetadata xmlns:u="urn:schemas-upnp-org:service:MusicServices:1">
  <Id>${serviceId}</Id>
  <Index>0</Index>
  <Count>100</Count>
  <Recursive>false</Recursive>
  ${accountFragment}
  <Uri>${escapeXml(objectId)}</Uri>
  <RequestedCount>100</RequestedCount>
</u:X_GetMetadata>`.trim();

  try {
    const xml = await httpPost(speakerIP, '/MusicServices/Control', soapAction, body);
    // Some firmware returns a wrapper with getMetadataResponse inside:
    // Safely parse both and extract DIDL Result.
    const parsed = await parseStringPromise(xml, { explicitArray: true, explicitRoot: true }).catch(() => null);

    // First try the native 1.1 form in case wrapper maps straight to it:
    let didlResult = '';
    if (parsed) {
      const resp11 = parsed?.['s:Envelope']?.['s:Body']?.[0]?.['u:getMetadataResponse']?.[0];
      didlResult = resp11?.Result?.[0] ?? '';
      if (!didlResult) {
        // Try a common variant path:
        const alt = parsed?.['s:Envelope']?.['s:Body']?.[0]?.['u:X_GetMetadataResponse']?.[0];
        didlResult = alt?.Result?.[0] ?? '';
      }
    }

    if (!didlResult) {
      // As a fallback, try parsing response with the generic parser above:
      return await parseSmapiGetMetadataResponse(speakerIP, xml, metaData);
    }

    const didl = await parseStringPromise(didlResult, { explicitArray: true, explicitRoot: true });
    const container = didl?.['DIDL-Lite'] ?? didl?.DIDL ?? didl;
    const items: any[] = [
      ...(container?.item ?? []),
      ...(container?.container ?? []),
    ];
    return items.map((it) => toFavoriteItem(speakerIP, it, metaData));
  } catch (err) {
    console.error('[smapi] getMetadata failed:', err);
    return [];
  }
}
