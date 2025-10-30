// server/sonos/volumeActual.ts
// Fetch actual speaker volume via RenderingControl:1 → GetVolume,
// broadcast DeskThing 'volume' events (with uuid or coordinator-only).

import axios from 'axios';
import xml2js from 'xml2js';
import { DeskThing } from '../initializer';

export async function getActualVolumeByIP(ip: string): Promise<number> {
  const url = `http://${ip}:1400/MediaRenderer/RenderingControl/Control`;
  const headers = {
    'Content-Type': 'text/xml; charset="utf-8"',
    'SOAPACTION': '"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"',
  };

  const body = `<?xml version="1.0" encoding="utf-8"?>
  <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
              s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
    <s:Body>
      <u:GetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
        <InstanceID>0</InstanceID>
        <Channel>Master</Channel>
      </u:GetVolume>
    </s:Body>
  </s:Envelope>`;

  const resp = await axios.post(url, body, { headers });
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
  const parsed = await parser.parseStringPromise(resp.data);

  const volStr =
    parsed?.['s:Envelope']?.['s:Body']?.['u:GetVolumeResponse']?.['CurrentVolume'] ??
    parsed?.Envelope?.Body?.GetVolumeResponse?.CurrentVolume ??
    '0';

  const vol = Number(volStr);
  return Number.isFinite(vol) ? vol : 0;
}

/** Broadcast volumes for specific UUIDs (if you want per-member updates). */
export async function broadcastActualVolumes(sonos: any, uuids: string[]) {
  if (!Array.isArray(uuids) || uuids.length === 0) return;

  for (const uuid of uuids) {
    try {
      const ip = await sonos.getSpeakerIPByUUID(uuid);
      if (!ip) continue;
      const level = await getActualVolumeByIP(ip);
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'volume',
        payload: { uuid, volume: level },
      });
    } catch (e: any) {
      sonos?.sendError?.(`[broadcastActualVolumes] ${e?.message || e}`);
    }
  }
}

/** Broadcast just the coordinator’s volume, resolved from current deviceIP. */
export async function broadcastActualCoordinatorVolume(sonos: any) {
  try {
    const ip = sonos?.deviceIP;
    if (!ip) return;
    const level = await getActualVolumeByIP(ip);
    // Send without uuid so clients can accept it universally
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'volume',
      payload: { volume: level },
    });
  } catch (e: any) {
    sonos?.sendError?.(`[broadcastActualCoordinatorVolume] ${e?.message || e}`);
  }
}
