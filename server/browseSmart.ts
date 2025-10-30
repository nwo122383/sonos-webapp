// server/browseSmart.ts
// Utilities for Sonos favorites browsing + transport.
// IMPORTANT:
// - We do not require the caller to pre-encode the objectId. We normalize it
//   to the encoded form expected by ContentDirectory:Browse.
// - Some services (SiriusXM, YTM, etc.) require encoded objectId. Passing a
//   decoded id can cause HTTP 405 on Browse.

import axios from "axios";
import xml2js from "xml2js";
import { DeskThing } from "./initializer";

export type BrowseResultItem = {
  id?: string;            // item @id
  browseId?: string;      // normalized id to re-browse if it's a container
  title?: string;         // dc:title
  date?: string;          // dc:date (ISO-ish)
  class?: string;         // upnp:class
  uri?: string;           // res (x-sonos-http, http, etc.)
  metaData?: string;      // DIDL fragment for this item
};

export type BrowseDebugBundle = {
  stage: string;
  request?: any;
  response?: any;
  items?: BrowseResultItem[];
  note?: string;
};

function xmlHeader(body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>${body}`;
}

function cdSoapEnvelope(inner: string) {
  return xmlHeader(
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <s:Body>
        <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
          ${inner}
        </u:Browse>
      </s:Body>
    </s:Envelope>`
  );
}

function avtSoapEnvelope(action: string, body: string) {
  return xmlHeader(
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <s:Body>
        <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
          ${body}
        </u:${action}>
      </s:Body>
    </s:Envelope>`
  );
}

async function postSoapRaw(
  speakerIP: string,
  path: string,
  soapAction: string,
  envelope: string
): Promise<string> {
  const url = `http://${speakerIP}:1400${path}`;
  const headers = {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPACTION": soapAction,
  };
  const { data, status } = await axios.post(url, envelope, { headers, timeout: 10_000 });
  if (status < 200 || status >= 300) throw new Error(`${soapAction} -> HTTP ${status}`);
  return typeof data === "string" ? data : String(data);
}

/** Extract first <res>…</res> from DIDL (raw or escaped). */
export function extractResFromMeta(metaData?: string): string | null {
  if (!metaData) return null;
  const raw = metaData.match(/<res[^>]*>([^<]+)<\/res>/i);
  if (raw?.[1]) return raw[1];
  const unescaped = metaData.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const esc = unescaped.match(/<res[^>]*>([^<]+)<\/res>/i);
  return esc?.[1] ?? null;
}

/** Try to pull r:objectId from DIDL metadata (raw or escaped). Returns encoded string if present. */
export function extractObjectIdFromMeta(metaData?: string): string | null {
  if (!metaData) return null;

  // Raw r:objectId
  const raw = metaData.match(/<r:objectId[^>]*>([^<]+)<\/r:objectId>/i);
  if (raw?.[1]) return raw[1];

  // Escaped r:objectId (&lt;r:objectId&gt;)
  const unescaped = metaData.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const esc = unescaped.match(/<r:objectId[^>]*>([^<]+)<\/r:objectId>/i);
  if (esc?.[1]) return esc[1];

  // Sometimes it's in a resMD blob
  const resMdMatch = unescaped.match(/<r:resMD[^>]*>([\s\S]*?)<\/r:resMD>/i);
  if (resMdMatch?.[1]) {
    const inner = resMdMatch[1];
    const innerMatch = inner.match(/<r:objectId[^>]*>([^<]+)<\/r:objectId>/i);
    if (innerMatch?.[1]) return innerMatch[1];
  }

  return null;
}

/** Try to pull objectId from a favorite/URI query string: …?objectId=ENCODED */
export function extractObjectIdFromFavoriteUri(uri?: string): string | null {
  if (!uri) return null;
  const m = uri.match(/[?&]objectId=([^&]+)/i);
  return m?.[1] || null;
}

/** Detect if the id already looks encoded (has any %XX). */
function isEncoded(id: string): boolean {
  return /%[0-9A-Fa-f]{2}/.test(id);
}

/** Normalize objectId so ContentDirectory:Browse accepts it. */
export function normalizeObjectIdForBrowse(objectId: string): string {
  if (!objectId) return objectId;
  // If no percent-escapes, minimally encode ':' which is the common culprit.
  if (!isEncoded(objectId)) {
    return objectId.replace(/:/g, "%3A");
  }
  return objectId;
}

/** Parse DIDL-Lite string into items. */
async function parseDIDLItems(didl: string): Promise<BrowseResultItem[]> {
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
  const result = await parser.parseStringPromise(didl).catch(() => ({} as any));
  const didlLite = result?.["DIDL-Lite"] || result?.["DIDL_Lite"] || result?.DIDL || result;
  if (!didlLite) return [];

  const nodes = didlLite.item || didlLite.container || [];
  const arr = Array.isArray(nodes) ? nodes : [nodes];

  const builder = new xml2js.Builder({ headless: true });
  return arr
    .map((node: any) => {
      if (!node) return null;
      const id = node?.["$"]?.id;
      const title = node?.["dc:title"] || node?.["title"] || node?.["upnp:title"];
      const date = node?.["dc:date"] || node?.["date"];
      const klass = node?.["upnp:class"] || node?.["class"];
      const res = node?.["res"] ? (typeof node["res"] === "string" ? node["res"] : node["res"]["_"]) : undefined;
      const didl = builder.buildObject({ "DIDL-Lite": node });
      return <BrowseResultItem>{
        id,
        browseId: id,
        title,
        date,
        class: klass,
        uri: res,
        metaData: didl,
      };
    })
    .filter(Boolean) as BrowseResultItem[];
}

/** Choose newest by dc:date (fallback to first). */
export function pickLatest(items: BrowseResultItem[]): BrowseResultItem | null {
  if (!items?.length) return null;
  const withDates = items
    .map((it) => ({ it, t: it.date ? Date.parse(it.date) : NaN }))
    .filter((o) => !isNaN(o.t))
    .sort((a, b) => b.t - a.t);
  return withDates[0]?.it || items[0];
}

/** Browse a container favorite by ObjectID. We normalize to encoded form before calling the SOAP action. */
export async function browseFavoriteSmart(
  objectIdRaw: string,
  speakerIP: string,
  metaData?: string,
  dbg?: { emit?: (stage: string, data: any) => void }
): Promise<{ items: BrowseResultItem[]; debug: BrowseDebugBundle[] }> {
  const debug: BrowseDebugBundle[] = [];
  const emit = (stage: string, data: any) => {
    debug.push({ stage, ...data });
    try { dbg?.emit?.(stage, data); } catch {}
  };

  const objectId = normalizeObjectIdForBrowse(objectIdRaw);
  emit("input", { objectIdRaw, objectId, metaPresent: !!metaData });

  const body = `
    <ObjectID>${objectId}</ObjectID>
    <BrowseFlag>BrowseDirectChildren</BrowseFlag>
    <Filter>*</Filter>
    <StartingIndex>0</StartingIndex>
    <RequestedCount>50</RequestedCount>
    <SortCriteria></SortCriteria>
  `;
  const envelope = cdSoapEnvelope(body);

  let raw: string;
  try {
    raw = await postSoapRaw(
      speakerIP,
      "/ContentDirectory/Control",
      `"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"`,
      envelope
    );
    emit("cd:raw", { len: raw?.length || 0 });
  } catch (e: any) {
    emit("cd:error", { error: e?.message || String(e) });
    throw e;
  }

  // Extract escaped DIDL from <Result>…</Result>
  const match = raw.match(/<Result>([\s\S]*?)<\/Result>/i);
  const resultEscaped = match ? match[1] : "";
  const didl = resultEscaped.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  emit("cd:result", { len: didl.length });

  const items = await parseDIDLItems(didl);
  emit("cd:items", { count: items.length });

  return { items, debug };
}

/** Set CurrentURI/MetaData then Play. */
export async function setAVTransportAndPlay(args: {
  uri: string;
  metaData?: string;
  speakerIP: string;
}) {
  const { uri, metaData, speakerIP } = args;
  const setBody = `
    <InstanceID>0</InstanceID>
    <CurrentURI>${uri}</CurrentURI>
    <CurrentURIMetaData>${metaData || ""}</CurrentURIMetaData>
  `;
  const playBody = `
    <InstanceID>0</InstanceID>
    <Speed>1</Speed>
  `;

  try {
    await postSoapRaw(
      speakerIP,
      "/MediaRenderer/AVTransport/Control",
      `"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"`,
      avtSoapEnvelope("SetAVTransportURI", setBody)
    );
  } catch (e: any) {
    DeskThing?.sendWarning?.(`SetAVTransportURI retry: ${e?.message || e}`);
    await new Promise((r) => setTimeout(r, 500));
    await postSoapRaw(
      speakerIP,
      "/MediaRenderer/AVTransport/Control",
      `"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"`,
      avtSoapEnvelope("SetAVTransportURI", setBody)
    );
  }

  await new Promise((r) => setTimeout(r, 250));
  await postSoapRaw(
    speakerIP,
    "/MediaRenderer/AVTransport/Control",
    `"urn:schemas-upnp-org:service:AVTransport:1#Play"`,
    avtSoapEnvelope("Play", playBody)
  );
}

/** Fast path: favorite DIDL already has <res>. */
export async function playLatestFromFavoriteDirect(metaData: string, speakerIP: string) {
  const uri = extractResFromMeta(metaData);
  if (!uri) throw new Error("No <res> in favorite metadata");
  await setAVTransportAndPlay({ uri, metaData, speakerIP });
}
