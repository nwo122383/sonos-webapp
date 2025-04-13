// server/sonos/favorites.ts

import axios from 'axios';
import xml2js from 'xml2js';
import { createDeskThing } from '@deskthing/server';
import { sendLog, sendError } from './logging';

const DeskThing = createDeskThing();

export class FavoritesManager {
  async playFavorite(ip: string, uri: string, metadata: string) {
    const url = `http://${ip}:1400/MediaRenderer/AVTransport/Control`;

    const soap = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
        s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
          <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
            <InstanceID>0</InstanceID>
            <CurrentURI>${uri}</CurrentURI>
            <CurrentURIMetaData>${metadata}</CurrentURIMetaData>
          </u:SetAVTransportURI>
        </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, soap, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
        },
        timeout: 4000,
      });

      const playSoap = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
          s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
            <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
              <InstanceID>0</InstanceID>
              <Speed>1</Speed>
            </u:Play>
          </s:Body>
        </s:Envelope>`;

      await axios.post(url, playSoap, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        },
        timeout: 4000,
      });

      sendLog(`Played favorite URI: ${uri}`);
    } catch (err) {
      sendError(`Failed to play favorite: ${err}`);
    }
  }

  async getFavorites(): Promise<any[]> {
    sendLog('[Favorites] getFavorites should now be handled inside SonosHandler, where album art encoding and IP state is available.');
    return [];
  }
}
