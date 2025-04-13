// server/sonos/metadata.ts

import axios from 'axios';
import xml2js from 'xml2js';
import { DeskThing } from '@deskthing/server';
import { sendError } from './logging';

export async function pollCurrentTrack(ip: string) {
  const url = `http://${ip}:1400/MediaRenderer/AVTransport/Control`;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <s:Body>
        <u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
          <InstanceID>0</InstanceID>
        </u:GetPositionInfo>
      </s:Body>
    </s:Envelope>`;

  try {
    const response = await axios.post(url, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"',
      },
      timeout: 4000,
    });

    const result = await xml2js.parseStringPromise(response.data);
    const info = result['s:Envelope']['s:Body'][0]['u:GetPositionInfoResponse'][0];
    const metadata = info.TrackMetaData?.[0];

    if (!metadata || metadata === 'NOT_IMPLEMENTED') return;

    const parsed = await xml2js.parseStringPromise(metadata);
    const item = parsed['DIDL-Lite']?.item?.[0];
    if (!item) return;

    const track = {
      track_name: item['dc:title']?.[0] || 'Unknown',
      artist: item['dc:creator']?.[0] || 'Unknown',
      album: item['upnp:album']?.[0] || 'Unknown',
      thumbnail: item['upnp:albumArtURI']?.[0]
        ? `http://${ip}${item['upnp:albumArtURI'][0]}`
        : null,
    };

    DeskThing.send({ app: 'sonos-webapp', type: 'song', payload: track });
  } catch (err) {
    sendError(`Failed to poll current track: ${err}`);
  }
}
