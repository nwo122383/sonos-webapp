// server/sonos/index.ts

import axios from 'axios';
import xml2js from 'xml2js';
import { createDeskThing, DeskThingClass } from '@deskthing/server';
import { GenericTransitData } from '@deskthing/types';
import { encode } from 'base64-arraybuffer';

const DeskThing: DeskThingClass<GenericTransitData, GenericTransitData> = createDeskThing();



interface Speaker {
  uuid: string;
  location: string;
  zoneName: string;
}

class SelectedSpeakerStore {
  private static instance: SelectedSpeakerStore;
  public selectedSpeakerIP: string | null = null;

  private constructor() {}

  public static getInstance(): SelectedSpeakerStore {
    if (!SelectedSpeakerStore.instance) {
      SelectedSpeakerStore.instance = new SelectedSpeakerStore();
    }
    return SelectedSpeakerStore.instance;
  }
}
export class SonosHandler {
  deviceIP: string | null = null;
  port: number = 1400;
  favoritesList: any[] = [];
  controlURL = `/MediaRenderer/AVTransport/Control`;
  avTransport = 'AVTransport';
  renderingControl = 'RenderingControl';
   deviceUUID: string | null = null;
  lastKnownSongData: any = null;
  pollingInterval: any = null;
  selectedSpeakerUUIDs: string[] | null = null;
  speakersList: { [uuid: string]: { ip: string; zoneName: string } } = {};
  selectedVolumeSpeakers: string[] = [];
  selectedPlaybackSpeakers: string[] = [];
  shuffleState: boolean = false;
  repeatState: 'off' | 'all' | 'one' = 'off';

 

  constructor() {
    this.sendSoapRequest = this.sendSoapRequest.bind(this);
  }
  private async sendSoapRequest({ action, service, body, ip }: {
    action: string;
    service: string;
    body: string;
    ip: string;
  }): Promise<string> {
    const url = `http://${ip}:1400/MediaRenderer/${service}/Control`;
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>${body}</s:Body>
      </s:Envelope>`;
  
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': `"${action}"`,
      },
      body: soapEnvelope,
    });
  
    if (!res.ok) {
      throw new Error(`SOAP Request Failed: ${res.status} ${res.statusText}`);
    }
  
    const text = await res.text();
    this.sendLog(`[SOAP Response] ${text.slice(0, 200)}...`);
    return text;
  }
  
  async getSpeakerIPByUUID(uuid: string): Promise<string | null> {
    if (this.speakersList[uuid]) return this.speakersList[uuid].ip;
    await this.getZoneGroupState();
    return this.speakersList[uuid]?.ip || null;
  }


  async selectVolumeSpeakers(uuids: string[]) {
    this.selectedVolumeSpeakers = uuids;
    this.sendLog(`Selected volume speakers: ${uuids.join(', ')}`);
  }

  async selectPlaybackSpeakers(uuids: string[]) {
    this.selectedPlaybackSpeakers = uuids;
    this.sendLog(`Selected playback speakers: ${uuids.join(', ')}`);
  }

  async selectSpeakers(uuids: string[]) {
    this.selectedSpeakerUUIDs = uuids;
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'selectedSpeakers',
      payload: { uuids },
    });

    if (uuids.length > 0) {
      const ip = await this.getSpeakerIPByUUID(uuids[0]);
      if (ip) {
        this.deviceIP = ip;
        console.log(`Device IP set to: ${this.deviceIP}`);
      } else {
        console.warn(`IP not found for speaker UUID: ${uuids[0]}`);
      }
    } else {
      this.deviceIP = null;
    }
  }

  async execute(action: string, params: any = {}) {
    if (!this.deviceIP) {
      throw new Error('Sonos device IP is not set. Cannot execute action.');
    }

    params = params || {};
    params.InstanceID = params.InstanceID || 0;

    const url = `http://${this.deviceIP}:${this.port}${this.controlURL}`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`;
    const xmlParams = Object.keys(params)
      .map((key) => `<${key}>${this.escape(params[key])}</${key}>`)
      .join('');
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:${action} xmlns:u="urn:schemas-upnp-org:service:${this.avTransport}:1">
                  ${xmlParams}
              </u:${action}>
          </s:Body>
      </s:Envelope>`;

    try {
      const response = await axios({
        method: 'POST',
        url: url,
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
        data: request,
      });

      if (response.status !== 200) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
      const result = await parser.parseStringPromise(response.data);
      const responseBody = result['s:Envelope']['s:Body'][`u:${action}Response`] || {};
      return responseBody;
    } catch (error: any) {
      this.sendError(`Error executing ${action}: ${error.response ? error.response.data : error.message}`);
      throw error;
    }
  }

  escape(input: string) {
    if (typeof input === 'string') {
      return input.replace(/[<>&'"]/g, (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          "'": '&apos;',
          '"': '&quot;',
        }[c])
      );
    }
    return input;
  }

  async addSpeakerToGroup(speakerIP: string, coordinatorIP: string) {
    try {
      if (!coordinatorIP || !speakerIP) {
        throw new Error('Coordinator IP or speaker IP is not provided');
      }

      const coordinatorUUID = await this.getDeviceUUID(coordinatorIP);
      const uri = `x-rincon:${coordinatorUUID}`;
      const originalDeviceIP = this.deviceIP;

      this.deviceIP = speakerIP;
      await this.setAVTransportURI(uri, '');

      this.sendLog(`Speaker ${speakerIP} added to group with coordinator: ${coordinatorUUID}`);

      this.deviceIP = originalDeviceIP;
    } catch (error: any) {
      this.sendError('Error adding speaker to group: ' + error.message);
      console.error('Error adding speaker to group:', error);
    }
  }

  async leaveGroup(speakerIP: string) {
    try {
      const originalDeviceIP = this.deviceIP;
  
      this.deviceIP = speakerIP;
      const deviceUUID = await this.getDeviceUUID();
  
      await this.setAVTransportURI(`x-rincon-queue:${deviceUUID}#0`, '');
      this.sendLog(`Speaker ${speakerIP} left the group`);
  
      this.deviceIP = originalDeviceIP;
    } catch (error: any) {
      this.sendError('Error leaving group: ' + error.message);
      console.error('Error leaving group:', error);
    }
  }
  
  async getAvailableSpeakers(): Promise<void> {
    await this.getZoneGroupState(); // make sure speakersList is updated
  
    console.log('[getAvailableSpeakers] Current speakersList:', this.speakersList);
  
    const speakersArray = Object.entries(this.speakersList).map(([uuid, info]) => ({
      uuid,
      zoneName: info.zoneName || uuid,
    }));
  
    console.log('[getAvailableSpeakers] Sending speakersArray:', speakersArray);
  
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'availableSpeakers',
      payload: speakersArray,
    });
  }
    
  
  async adjustVolume(delta: number) {
    const speakerStore = SelectedSpeakerStore.getInstance();
    let speakersToAdjust = this.selectedVolumeSpeakers;
  
    if (!speakersToAdjust || speakersToAdjust.length === 0) {
      if (speakerStore.selectedSpeakerIP) {
        speakersToAdjust = [speakerStore.selectedSpeakerIP];
      }
    }
  
    if (!speakersToAdjust || speakersToAdjust.length === 0) {
      this.sendError('[adjustVolume] No speakers selected to adjust volume.');
      return;
    }
  
    for (const uuid of speakersToAdjust) {
      const ip = await this.getSpeakerIPByUUID(uuid);
      if (!ip) {
        this.sendError(`[adjustVolume] Could not find IP for UUID: ${uuid}`);
        continue;
      }
  
      const currentVol = await this.getCurrentVolume([uuid]);
      const newVolume = Math.min(100, Math.max(0, currentVol + delta));
      await this.setVolume(newVolume, [uuid]);
      this.sendLog(`[adjustVolume] Volume adjusted to ${newVolume} on ${uuid}`);
    }
  }
  
  async getZoneGroupState(): Promise<string> {
    if (!this.deviceIP) return '';
    const url = `http://${this.deviceIP}:${this.port}/ZoneGroupTopology/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
        s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
          <u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1"></u:GetZoneGroupState>
        </s:Body>
      </s:Envelope>`;

    const response = await axios.post(url, request, {
      headers: { 'SOAPAction': soapAction, 'Content-Type': 'text/xml; charset=utf-8' },
    });

    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true, ignoreAttrs: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
    const result = await parser.parseStringPromise(response.data);
    const zoneGroupState = result.Envelope.Body.GetZoneGroupStateResponse.ZoneGroupState;

    const innerParser = new xml2js.Parser({ explicitArray: false, explicitRoot: false, mergeAttrs: true, tagNameProcessors: [xml2js.processors.stripPrefix] });
    const zoneGroupStateParsed = await innerParser.parseStringPromise(zoneGroupState);

    const groups = Array.isArray(zoneGroupStateParsed.ZoneGroups.ZoneGroup)
      ? zoneGroupStateParsed.ZoneGroups.ZoneGroup
      : [zoneGroupStateParsed.ZoneGroups.ZoneGroup];

    this.speakersList = {};

    for (const group of groups) {
      const members = Array.isArray(group.ZoneGroupMember) ? group.ZoneGroupMember : [group.ZoneGroupMember];
      for (const member of members) {
        const uuid = member.UUID;
        const ip = this.extractIPAddress(member.Location);
        if (uuid && ip) {
          this.speakersList[uuid] = { ip, zoneName: member.ZoneName };
        }
      }
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'zoneGroupState',
      payload: zoneGroupState,
    });

    return zoneGroupState;
  }

  
  
  
  
  

  async joinGroup(coordinatorIP: string, deviceIP: string) {
    try {
      if (!coordinatorIP || !deviceIP) {
        throw new Error('Coordinator IP or device IP is not provided');
      }
  
      const coordinatorUUID = await this.getDeviceUUID(coordinatorIP);
  
      if (!coordinatorUUID) {
        throw new Error('Coordinator UUID could not be resolved.');
      }
  
      const uri = `x-rincon:${coordinatorUUID}`;
      const originalDeviceIP = this.deviceIP;
  
      this.deviceIP = deviceIP;
      await this.setAVTransportURI(uri, '');
  
      this.sendLog(`Device ${deviceIP} joined group with coordinator: ${coordinatorUUID}`);
  
      this.deviceIP = originalDeviceIP;
    } catch (error: any) {
      this.sendError('Error joining group: ' + error.message);
      console.error('Error joining group:', error);
    }
  }
  
  async getDeviceUUID(deviceIP: string = this.deviceIP as string): Promise<string> {
    if (!deviceIP) {
      throw new Error('Device IP is not set.');
    }
  
    try {
      const response = await axios.get(`http://${deviceIP}:${this.port}/status/zp`);
      const data = response.data;
  
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const result = await parser.parseStringPromise(data);
      const localUID = result.ZPSupportInfo?.ZPInfo?.LocalUID || result.ZPInfo?.LocalUID;
  
      if (!localUID) {
        throw new Error('Unable to retrieve device UUID.');
      }
  
      return localUID;
    } catch (error: any) {
      this.sendError('Error retrieving device UUID: ' + error.message);
      throw error;
    }
  }
  
  
  


  async getCurrentPlayMode(): Promise<string> {
    const action = 'GetTransportSettings';
    const params = { InstanceID: 0 };
    try {
      const result = await this.execute(action, params);
      const playMode = result['PlayMode'];
      this.sendLog(`Current play mode: ${playMode}`);
      return playMode;
    } catch (error: any) {
      this.sendError('Error getting current play mode: ' + error.message);
      throw error;
    }
  }

  async fastForward(seconds = 15) {
    try {
      const currentPosition = await this.getCurrentPosition();
      const newPosition = currentPosition + seconds;
      await this.seekToTime(newPosition);
    } catch (error: any) {
      this.sendError('Error fast forwarding: ' + error.message);
    }
  }

  async rewind(seconds = 15) {
    try {
      const currentPosition = await this.getCurrentPosition();
      const newPosition = Math.max(currentPosition - seconds, 0);
      await this.seekToTime(newPosition);
    } catch (error: any) {
      this.sendError('Error rewinding: ' + error.message);
    }
  }

  async getCurrentPosition(): Promise<number> {
    const action = 'GetPositionInfo';
    const params = { InstanceID: 0 };
    const result = await this.execute(action, params);
    const relTime = result['RelTime']; // Format: hh:mm:ss
    const timeParts = relTime.split(':').map(Number);
    const seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    return seconds;
  }

  async seekToTime(positionInSeconds: number) {
    const hours = Math.floor(positionInSeconds / 3600);
    const minutes = Math.floor((positionInSeconds % 3600) / 60);
    const seconds = positionInSeconds % 60;
    const target = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
    await this.seek('REL_TIME', target);
  }

  padZero(value: number): string {
    return value.toString().padStart(2, '0');
  }

  async repeat(state: 'off' | 'all' | 'one') {
    let newPlayMode = 'NORMAL';
    switch (state) {
      case 'off':
        newPlayMode = 'NORMAL';
        break;
      case 'all':
        newPlayMode = 'REPEAT_ALL';
        break;
      case 'one':
        newPlayMode = 'REPEAT_ONE';
        break;
      default:
        newPlayMode = 'NORMAL';
        break;
    }
    await this.execute('SetPlayMode', { NewPlayMode: newPlayMode });
    this.sendLog(`Repeat mode set to ${state}`);
  }

  async shuffle(state: boolean) {
    let newPlayMode = 'NORMAL';
    if (state) {
      newPlayMode = 'SHUFFLE_NOREPEAT';
    } else {
      newPlayMode = 'NORMAL';
    }
    await this.execute('SetPlayMode', { NewPlayMode: newPlayMode });
    this.sendLog(`Shuffle mode set to ${state ? 'on' : 'off'}`);
  }

  async updatePlayMode() {
    let playMode = 'NORMAL';

    if (this.shuffleState && this.repeatState === 'all') {
      playMode = 'SHUFFLE';
    } else if (this.shuffleState && this.repeatState === 'off') {
      playMode = 'SHUFFLE_NOREPEAT';
    } else if (!this.shuffleState && this.repeatState === 'all') {
      playMode = 'REPEAT_ALL';
    } else if (!this.shuffleState && this.repeatState === 'one') {
      playMode = 'REPEAT_ONE';
    } else {
      playMode = 'NORMAL';
    }

    await this.setPlayMode(playMode);
  }

  async setPlayMode(playMode: string) {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#SetPlayMode"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:SetPlayMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                  <InstanceID>0</InstanceID>
                  <NewPlayMode>${playMode}</NewPlayMode>
              </u:SetPlayMode>
          </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
      this.sendLog(`Set play mode to ${playMode}`);
    } catch (error: any) {
      this.sendError('Error setting play mode: ' + error.message);
      throw error;
    }
  }

  async getFavorites() {
    if (!this.deviceIP) {
      throw new Error('Sonos device IP is not set.');
    }

    const url = `http://${this.deviceIP}:${this.port}/MediaServer/ContentDirectory/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
            <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
                <ObjectID>FV:2</ObjectID>
                <BrowseFlag>BrowseDirectChildren</BrowseFlag>
                <Filter>*</Filter>
                <StartingIndex>0</StartingIndex>
                <RequestedCount>100</RequestedCount>
                <SortCriteria></SortCriteria>
            </u:Browse>
        </s:Body>
    </s:Envelope>`;

    this.sendLog(`Fetching Sonos favorites`);

    try {
      const response = await axios({
        method: 'POST',
        url: url,
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
        data: request,
      });

      if (response.status !== 200) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      this.sendLog(`SOAP Response received`);

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
      const parsedResult = await parser.parseStringPromise(response.data);
      const favoritesResult = parsedResult['s:Envelope']['s:Body']['u:BrowseResponse']['Result'];

      this.sendLog(`Parsed Favorites XML`);

      const metadataParser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const metaResult = await metadataParser.parseStringPromise(favoritesResult);
      let items = metaResult['DIDL-Lite'] && metaResult['DIDL-Lite']['item'];

      if (!items) {
        throw new Error('No items found in favorites.');
      }

      if (!Array.isArray(items)) {
        items = [items];
      }

      const favoritesList = await Promise.all(
        items.map(async (item: any) => {
          const title = item['dc:title'] || 'Unknown Title';
          const resVal = item['res'];
          const uri = typeof resVal === 'object' ? resVal._ : resVal || null;
          const albumArtURI = item['upnp:albumArtURI'] || null;
          const metaData = item['r:resMD'] || item['resMD'] || '';

          let upnpClass = item['upnp:class'] || '';
          if (!upnpClass && metaData) {
            try {
              const meta = await metadataParser.parseStringPromise(metaData);
              const metaItem = meta['DIDL-Lite']?.item || meta['DIDL-Lite']?.container;
              upnpClass = metaItem?.['upnp:class'] || '';
            } catch (err: any) {
              this.sendError(`Error parsing favorite metadata: ${err.message}`);
            }
          }

          const isContainer = upnpClass.includes('object.container');
          let id = item?.$?.id || '';
          let browseId = id;

          if (isContainer && metaData) {
            try {
              const meta = await metadataParser.parseStringPromise(metaData);
              const metaItem = meta['DIDL-Lite']?.item || meta['DIDL-Lite']?.container;
              browseId = metaItem?.$?.id || id;
            } catch (err: any) {
              this.sendError(`Error extracting container id: ${err.message}`);
            }
          }

          let formattedAlbumArtURI = albumArtURI;
          if (albumArtURI && !albumArtURI.startsWith('http://') && !albumArtURI.startsWith('https://')) {
            formattedAlbumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
          }

          const encodedAlbumArtURI = formattedAlbumArtURI ? await this.getImageData(formattedAlbumArtURI) : null;

          return {
            title,
            uri,
            albumArt: encodedAlbumArtURI || null,
            metaData,
            isContainer,
            id,
            browseId,
          };
        })
      );

      this.favoritesList = favoritesList;

      DeskThing.send({ app: 'sonos-webapp', type: 'favorites', payload: favoritesList });
    } catch (error: any) {
      this.sendError(`Error fetching favorites: ${error.response ? error.response.data : error.message}`);
    }
  }

  async browseFavorite(objectId: string, speakerIP: string): Promise<any[]> {
    const soapBody = `
      <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
        <ObjectID>${objectId}</ObjectID>
        <BrowseFlag>BrowseDirectChildren</BrowseFlag>
        <Filter>*</Filter>
        <StartingIndex>0</StartingIndex>
        <RequestedCount>100</RequestedCount>
        <SortCriteria></SortCriteria>
      </u:Browse>
  `   ;

  const envelope = `
    <?xml version="1.0" encoding="utf-8"?>
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
                s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <s:Body>${soapBody}</s:Body>
    </s:Envelope>
  `;

  const url = `http://${speakerIP}:1400/MediaServer/ContentDirectory/Control`;

  const headers = {
    'Content-Type': 'text/xml; charset="utf-8"',
    SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
  };

  try {
    const { data } = await axios.post(url, envelope, { headers });
    const result = await xml2js.parseStringPromise(data, { explicitArray: false });

    const rawResult = result['s:Envelope']?.['s:Body']?.['u:BrowseResponse']?.Result;

    const parsed = await xml2js.parseStringPromise(rawResult, {
      explicitArray: false,
      ignoreAttrs: false,
    });

    const items = parsed['DIDL-Lite']?.item;
    if (!items) return [];

    // Always return an array
    return Array.isArray(items) ? items : [items];
  } catch (error) {
    console.error('Error in browseFavorite:', error);
    return [];
  }
}


  async getFavoriteContainer(id: string) {
    this.sendLog(`[getFavoriteContainer] Fetching children for ${id}`);
    try {
      const children = await this.browseFavorite(id);
      this.sendLog(`[getFavoriteContainer] Retrieved ${children.length} children`);
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'favoriteChildren',
        payload: children,
      });
    } catch (err: any) {
      this.sendError(`[getFavoriteContainer] ${err.message}`);
      throw err;
    }
  }
  async getSelectedVolumeSpeakers() {
    try {
      const selected = this.volumeSpeakers;
      if (!selected.length) {
        const allUUIDs = Object.keys(this.speakersList);
        if (allUUIDs.length > 0) {
          this.volumeSpeakers = [allUUIDs[0]];
          console.log(`[getSelectedVolumeSpeakers] No speakers selected. Fallback to: ${allUUIDs[0]}`);
        } else {
          console.log('[getSelectedVolumeSpeakers] No speakers available to select.');
        }
      }
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'selectedVolumeSpeakers',
        payload: this.volumeSpeakers,
      });
    } catch (err) {
      this.sendError('Error getting selected volume speakers: ' + err.message);
    }
  }
  
  async getSelectedPlaybackSpeakers() {
    try {
      const selected = this.playbackSpeakers;
      if (!selected.length) {
        const allUUIDs = Object.keys(this.speakersList);
        if (allUUIDs.length > 0) {
          this.playbackSpeakers = [allUUIDs[0]];
          console.log(`[getSelectedPlaybackSpeakers] No speakers selected. Fallback to: ${allUUIDs[0]}`);
        } else {
          console.log('[getSelectedPlaybackSpeakers] No speakers available to select.');
        }
      }
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'selectedPlaybackSpeakers',
        payload: this.playbackSpeakers,
      });
    } catch (err) {
      this.sendError('Error getting selected playback speakers: ' + err.message);
    }
  }
  
  
  async playFavoriteOnSpeakers(uri: any, speakerUUIDs: string[]) {
    if (speakerUUIDs.length === 0) {
      throw new Error('No speakers selected to play the favorite.');
    }

    const coordinatorUUID = speakerUUIDs[0];
    const coordinatorIP = await this.getSpeakerIPByUUID(coordinatorUUID);
    if (!coordinatorIP) {
      throw new Error('Coordinator speaker IP not found.');
    }

    for (let i = 1; i < speakerUUIDs.length; i++) {
      const speakerUUID = speakerUUIDs[i];
      const speakerIP = await this.getSpeakerIPByUUID(speakerUUID);
      if (speakerIP) {
        await this.addSpeakerToGroup(speakerIP, coordinatorIP);
      }
    }

    this.deviceIP = coordinatorIP;
    const uriString = typeof uri === 'object' && uri ? uri._ : uri;
    await this.playFavorite(uriString);

    if (this.selectedSpeakerUUIDs && !this.selectedSpeakerUUIDs.includes(coordinatorUUID)) {
      this.selectedSpeakerUUIDs.unshift(coordinatorUUID);
    }
  }

  async playFavorite(uri: string, metaData: string | null = null) {
    try {
      this.sendLog(`Attempting to play favorite URI: ${uri}`);

      if (!metaData) {
        const favorite = this.favoritesList.find((fav) => fav.uri === uri);
        if (favorite && favorite.metaData) {
          metaData = favorite.metaData;
        } else {
          throw new Error(`Metadata not found for URI: ${uri}`);
        }
      }

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const parsedMetaData = await parser.parseStringPromise(metaData);
      const item = parsedMetaData['DIDL-Lite']['item'];
      const upnpClass = item['upnp:class'];

      this.sendLog(`Using metadata with upnp:class: ${upnpClass}`);

      if (
        upnpClass.includes('object.container.playlistContainer') ||
        upnpClass.includes('object.container.album.musicAlbum')
      ) {
        await this.clearQueue();
        const response = await this.addURIToQueue(uri, metaData);
        const trackNr = response.FirstTrackNumberEnqueued || 1;

        this.sendLog(`Added URI to queue. First track number enqueued: ${trackNr}`);

        await this.playFromQueue();
        await this.seek('TRACK_NR', trackNr);
        await this.play();

        this.sendLog(`Playing favorite from queue: ${item['dc:title']}`);
      } else {
        await this.setAVTransportURI(uri, metaData);
        await this.play();
        this.startTrackInfoPolling();
        this.sendLog(`Playing favorite: ${item['dc:title']}`);
      }

      
    } catch (error: any) {
      this.sendError(`Error playing favorite: ${error.message}`);
    }
    DeskThing.send({ type: 'music', payload: songData }); // for CarThing mini-player
    DeskThing.send({ app: 'client', type: 'song', payload: songData }); // optional, for your own use
  }

  async addURIToQueue(uri: string, metadata: string) {
    return this.execute('AddURIToQueue', {
      InstanceID: 0,
      EnqueuedURI: uri,
      EnqueuedURIMetaData: metadata,
      DesiredFirstTrackNumberEnqueued: 0,
      EnqueueAsNext: 0,
    });
  }

  async clearQueue() {
    return this.execute('RemoveAllTracksFromQueue', { InstanceID: 0 });
  }

  async playFromQueue() {
    const uuid = await this.getDeviceUUID();
    const queueURI = `x-rincon-queue:${uuid}#0`;
    await this.setAVTransportURI(queueURI, '');
  }

  async seek(unit: string, target: any) {
    return this.execute('Seek', { InstanceID: 0, Unit: unit, Target: target });
  }

  async setAVTransportURI(uri: string, metadata: string) {
    return this.execute('SetAVTransportURI', {
      CurrentURI: uri,
      CurrentURIMetaData: metadata || '',
    });
  }

  async play() {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#Play"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                  <InstanceID>0</InstanceID>
                  <Speed>1</Speed>
              </u:Play>
          </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
      this.sendLog('Playback started');
    } catch (error: any) {
      this.sendError('Error starting playback: ' + error.message);
      throw error;
    }
  }

  async pause() {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#Pause"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                  <InstanceID>0</InstanceID>
              </u:Pause>
          </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
      this.sendLog('Playback paused');
    } catch (error: any) {
      this.sendError('Error pausing playback: ' + error.message);
      throw error;
    }
  }

  async next() {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#Next"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                  <InstanceID>0</InstanceID>
              </u:Next>
          </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
      this.sendLog('Skipped to next track');
    } catch (error: any) {
      this.sendError('Error skipping to next track: ' + error.message);
      throw error;
    }
  }

  async previous() {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#Previous"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                  <InstanceID>0</InstanceID>
              </u:Previous>
          </s:Body>
      </s:Envelope>`;

    try {
      await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
      this.sendLog('Went back to previous track');
    } catch (error: any) {
      this.sendError('Error going back to previous track: ' + error.message);
      throw error;
    }
  }

  
  
  startPollingTrackInfo(interval = 10000) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.getTrackInfo();
    }, interval);
  }

  stopPollingTrackInfo() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async getTrackInfo() {
    const action = 'GetPositionInfo';
    const params = { InstanceID: 0 };
  
    try {
      const result = await this.execute(action, params);
      const trackMetaData = result['TrackMetaData'];
  
      this.sendLog(`Track MetaData: ${trackMetaData}`);
  
      let track: string | null = null;
      let artist: string | null = null;
      let album: string | null = null;
      let albumArtURI: string | null = null;
  
      if (trackMetaData && trackMetaData.includes('<DIDL-Lite')) {
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const metaResult = await parser.parseStringPromise(trackMetaData);
  
        const item = metaResult?.['DIDL-Lite']?.['item'];
        this.sendLog(`Parsed item: ${JSON.stringify(item)}`);
        this.sendLog(`Available keys in item: ${item ? Object.keys(item).join(', ') : 'none'}`);
  
        albumArtURI = item?.['upnp:albumArtURI'] || item?.['albumArtURI'] || null;
  
        const streamContent = item?.['r:streamContent'] || item?.['streamContent'];
        if (streamContent && streamContent.trim()) {
          this.sendLog(`streamContent: ${streamContent}`);
  
          // Try SiriusXM key=value parsing
          const regex = /([A-Z]+)\s([^|]+)/g;
          let match;
          while ((match = regex.exec(streamContent)) !== null) {
            const key = match[1].trim().toUpperCase();
            const value = match[2].trim();
            this.sendLog(`Parsed key: "${key}" → value: "${value}"`);
            switch (key) {
              case 'TITLE':
                track = value;
                break;
              case 'ARTIST':
                artist = value;
                break;
              case 'ALBUM':
                album = value;
                break;
            }
          }
  
          // Fallback for radio-style "Artist - Track"
          if (!artist && !track && streamContent.includes('-')) {
            const [possibleArtist, possibleTrack] = streamContent.split('-').map(s => s.trim());
            if (possibleArtist && possibleTrack) {
              artist = possibleArtist;
              track = possibleTrack;
              this.sendLog(`Inferred radio-style streamContent → Artist: ${artist}, Track: ${track}`);
            }
          }
        }
  
        // Fallback to DIDL values
        if (!track) {
          track = item?.['dc:title'] || item?.['title'] || 'Unknown Track';
        }
        if (!artist) {
          artist = item?.['dc:creator'] || item?.['creator'] || 'Unknown Artist';
        }
        if (!album) {
          album = item?.['upnp:album'] || item?.['album'] || 'Unknown Album';
        }
  
        if (albumArtURI && !albumArtURI.startsWith('http')) {
          albumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
        }
  
        this.sendLog(`Final parsed values → Track: ${track}, Artist: ${artist}, Album: ${album}`);
        this.sendLog(`Album art URI: ${albumArtURI}`);
      }
  
      const songData = {
        track_name: track || 'Unknown Track',
        artist: artist || 'Unknown Artist',
        album: album || 'Unknown Album',
        thumbnail: albumArtURI ? await this.getImageData(albumArtURI) : null,
      };
  
      this.lastKnownSongData = songData;
  
      this.sendLog(`✅ Fetched Track Info: ${songData.artist} - ${songData.track_name}, Album - ${songData.album}, AlbumArtURI - ${albumArtURI}`);
  
      DeskThing.sendSong(songData);
      //DeskThing.send({ app: 'client', type: 'music', payload: songData });
      //DeskThing.send({ app: 'sonos-webapp', type: 'music', payload: songData });
  
    } catch (error: any) {
      this.sendError(`getTrackInfo error: ${error.message}`);
      if (this.lastKnownSongData) {
        DeskThing.send({ app: 'client', type: 'music', payload: this.lastKnownSongData });
      }
    }
  }
  
  
  
  
  
  
  

  async setVolume(volume: number, speakerUUIDs: string[] = []) {
    const speakerStore = SelectedSpeakerStore.getInstance();
    let speakersToAdjust = speakerUUIDs;

    if (speakersToAdjust.length === 0) {
      if (this.selectedVolumeSpeakers && this.selectedVolumeSpeakers.length > 0) {
        speakersToAdjust = this.selectedVolumeSpeakers;
      } else if (speakerStore.selectedSpeakerIP) {
        speakersToAdjust = [speakerStore.selectedSpeakerIP];
      }
    }

    if (speakersToAdjust.length === 0) {
      throw new Error('No speakers available to adjust volume.');
    }

    for (const uuid of speakersToAdjust) {
      let speakerIP: string | null = null;

      if (/^\d+\.\d+\.\d+\.\d+$/.test(uuid)) {
        speakerIP = uuid;
      } else {
        speakerIP = await this.getSpeakerIPByUUID(uuid);
      }

      if (speakerIP) {
        const originalDeviceIP = this.deviceIP;
        this.deviceIP = speakerIP;

        this.sendLog(`Setting volume to ${volume} on speaker ${uuid} (IP: ${speakerIP})`);

        const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/RenderingControl/Control`;
        const soapAction = `"urn:schemas-upnp-org:service:RenderingControl:1#SetVolume"`;
        const request = `<?xml version="1.0" encoding="utf-8"?>
          <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                      s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
              <s:Body>
                  <u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
                      <InstanceID>0</InstanceID>
                      <Channel>Master</Channel>
                      <DesiredVolume>${volume}</DesiredVolume>
                  </u:SetVolume>
              </s:Body>
          </s:Envelope>`;

        try {
          await axios({
            method: 'POST',
            url: url,
            headers: {
              'SOAPAction': soapAction,
              'Content-Type': 'text/xml; charset=utf-8',
            },
            data: request,
          });

          this.sendLog(`Successfully set volume on speaker ${uuid}`);
        } catch (error: any) {
          this.sendError(`Error setting volume on speaker ${uuid}: ${error.message}`);
        } finally {
          this.deviceIP = originalDeviceIP;
        }

        speakerStore.selectedSpeakerIP = speakerIP;
      } else {
        this.sendError(`Speaker IP not found for UUID: ${uuid}`);
      }
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'volumeChange',
      payload: { volume },
    });
  }

  async getCurrentVolume(speakerUUIDs: string[]): Promise<number> {
    if (speakerUUIDs.length === 0) {
      throw new Error('No speakers selected to get volume.');
    }

    const uuid = speakerUUIDs[0];
    const speakerIP = await this.getSpeakerIPByUUID(uuid);
    if (speakerIP) {
      const originalDeviceIP = this.deviceIP;
      this.deviceIP = speakerIP;

      const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/RenderingControl/Control`;
      const soapAction = `"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"`;
      const request = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                    s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <s:Body>
                <u:GetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
                    <InstanceID>0</InstanceID>
                    <Channel>Master</Channel>
                </u:GetVolume>
            </s:Body>
        </s:Envelope>`;

      let volume: number;

      try {
        const response = await axios.post(url, request, {
          headers: {
            'SOAPAction': soapAction,
            'Content-Type': 'text/xml; charset=utf-8',
          },
        });

        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(response.data);
        volume = parseInt(result['s:Envelope']['s:Body']['u:GetVolumeResponse']['CurrentVolume'], 10);

        this.sendLog(`Fetched volume from speaker ${uuid}: ${volume}`);
      } catch (error: any) {
        this.sendError(`Error getting volume from speaker ${uuid}: ${error.message}`);
        throw error;
      } finally {
        this.deviceIP = originalDeviceIP;
      }

      return volume;
    } else {
      throw new Error(`Speaker IP not found for UUID: ${uuid}`);
    }
  }

  extractIPAddress(url: string): string | null {
    try {
      const parsedURL = new URL(url);
      return parsedURL.hostname;
    } catch (error) {
      if (error instanceof Error) {
        this.sendError('Error parsing URL to extract IP address: ' + error.message);
      } else {
        this.sendError('Error parsing URL to extract IP address: ' + String(error));
      }
      return null;
    }
  }

  async getImageData(imageUrl: string) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      const mimeType = response.headers['content-type'];
      return `data:${mimeType};base64,${base64}`;
    } catch (error: any) {
      this.sendError('Error fetching image: ' + error.message);
      return null;
    }
  }

  async sendLog(message: string) {
    console.log(message);
  }

  async sendError(message: string) {
    console.error(message);
  }

  async checkForRefresh() {
    this.sendLog('Checking for refresh...');
    await this.getTrackInfo();
  }
}

export default SonosHandler;