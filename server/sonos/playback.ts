// server/sonos/playback.ts

import axios from 'axios';
import { sendError } from './logging';

export class PlaybackController {
  private async sendSOAP(ip: string, action: string) {
    const url = `http://${ip}:1400/MediaRenderer/AVTransport/Control`;

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
        s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
          <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
            <InstanceID>0</InstanceID>
          </u:${action}>
        </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, soapBody, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
        },
      });
    } catch (err) {
      sendError(`Failed to send ${action}: ${err}`);
    }
  }

  async pause(ip: string) {
    await this.sendSOAP(ip, 'Pause');
  }

  async next(ip: string) {
    await this.sendSOAP(ip, 'Next');
  }

  async previous(ip: string) {
    await this.sendSOAP(ip, 'Previous');
  }
}
