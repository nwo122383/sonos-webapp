// server/sonos/index.ts

import axios from 'axios';
import xml2js, { parseStringPromise } from 'xml2js';
import { createDeskThing, DeskThingClass } from '@deskthing/server';
import { GenericTransitData } from '@deskthing/types';
import { encode } from 'base64-arraybuffer';
import {
  normalizeObjectIdForBrowse,
  extractObjectIdFromMeta,
  extractObjectIdFromFavoriteUri,
  browseFavoriteSmart,
  BrowseResultItem,
} from '../browseSmart';
import { browseSmapi, FavoriteItem } from '../smapi';

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

  // Play the newest child (episode) of a container favorite
  async playLatestFromFavorite(objectId: string, speakerIP: string, speakerUUIDs: string[]) {
    const { soapId, normalized } = this.resolveSoapObjectId(objectId);
    const soapBody = `
      <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
        <ObjectID>${soapId}</ObjectID>
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
      this.sendLog(`[playLatestFromFavorite] Browsing children of ${objectId} (normalized: ${normalized}) on ${speakerIP}`);

      const resp = await axios.post(url, `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                    s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>${soapBody}</s:Body>
        </s:Envelope>`, { headers });

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
          return { uri: res || null, title: it?.['dc:title'] || 'Unknown', date: t, metaData: meta };
        })
        .filter((x: any) => !!x.uri);

      if (normalized.length === 0) throw new Error('No playable episodes found in this container.');

      normalized.sort((a, b) => b.date - a.date);
      const latest = normalized[0];

      await this.playFavoriteOnSpeakers(latest.uri, speakerUUIDs, latest.metaData);
      this.sendLog(`[playLatestFromFavorite] Playing latest episode: ${latest.title}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to resolve latest episode.';
      this.sendError(`[playLatestFromFavorite] ${msg}`);
      throw err;
    }
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

  private ensureAlbumArtAbsolute(art: string | undefined | null, speakerIP: string): string | null {
    if (!art || typeof art !== 'string') return null;
    if (/^https?:\/\//i.test(art)) return art;
    const bareHost = speakerIP.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const hostWithPort = bareHost.includes(':') ? bareHost : `${bareHost}:1400`;
    const path = art.startsWith('/') ? art : `/${art}`;
    return `http://${hostWithPort}${path}`;
  }

  private extractAlbumArtFromMeta(meta?: string | null, speakerIP?: string): string | null {
    if (!meta) return null;
    const raw = meta.match(/<upnp:albumArtURI[^>]*>([^<]+)<\/upnp:albumArtURI>/i);
    const unescaped = meta.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const esc = raw?.[1] ? raw[1] : unescaped.match(/<upnp:albumArtURI[^>]*>([^<]+)<\/upnp:albumArtURI>/i)?.[1];
    if (!esc) return null;
    return speakerIP ? this.ensureAlbumArtAbsolute(esc, speakerIP) : esc;
  }

  private extractAccountId(meta?: string | null, uri?: string | null): string | null {
    if (uri) {
      const match = uri.match(/[?&]sn=(\d+)/i);
      if (match?.[1]) return match[1];
    }
    if (meta) {
      const unescaped = meta.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const m = unescaped.match(/<r:accountId[^>]*>([^<]+)<\/r:accountId>/i);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  private extractDateFromMeta(meta?: string | null): string | null {
    if (!meta) return null;
    const inspect = (input: string): string | null => {
      const dc = input.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
      if (dc?.[1]) return dc[1];
      const obd = input.match(/<upnp:originalBroadcastDate[^>]*>([^<]+)<\/upnp:originalBroadcastDate>/i);
      if (obd?.[1]) return obd[1];
      const release = input.match(/<releaseDate[^>]*>([^<]+)<\/releaseDate>/i);
      if (release?.[1]) return release[1];
      return null;
    };
    const direct = inspect(meta);
    if (direct) return direct;
    const unescaped = meta.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return inspect(unescaped);
  }

  private mapBrowseResultItems(items: BrowseResultItem[], speakerIP: string) {
    return items.map((item) => ({
      uri: item.uri || null,
      title: item.title || 'Unknown',
      albumArt: this.extractAlbumArtFromMeta(item.metaData || '', speakerIP) || null,
      metaData: item.metaData || '',
      isContainer: Boolean(item.class && item.class.includes('object.container')),
      id: item.id || item.browseId || item.title || '',
      browseId: item.browseId || item.id || '',
      releaseDate: item.date || this.extractDateFromMeta(item.metaData || '') || null,
    }));
  }

  private mapSmapiItems(items: FavoriteItem[], speakerIP: string) {
    return items.map((item) => {
      const rawArt = item.albumArt || null;
      const albumArt =
        !rawArt
          ? null
          : rawArt.startsWith('data:')
            ? rawArt
            : this.ensureAlbumArtAbsolute(rawArt, speakerIP) || rawArt;

      return {
        uri: item.uri || null,
        title: item.title || 'Unknown',
        albumArt,
        metaData: item.metaData || '',
        isContainer: !!item.isContainer,
        id: item.id || item.browseId || item.title || '',
        browseId: item.browseId || item.id || '',
        releaseDate: this.extractDateFromMeta(item.metaData || '') || null,
      };
    });
  }

  private async browseFavoriteViaSmapi(
    favorite: any | undefined,
    objectId: string,
    speakerIP: string
  ) {
    if (!favorite?.metaData) {
      return [];
    }

    const encodedObjectId =
      favorite.rawObjectId ||
      extractObjectIdFromMeta(favorite.metaData) ||
      objectId;

    try {
      console.log('[Sonos] Attempting SMAPI browse for', encodedObjectId);
      const items = await browseSmapi({
        speakerIP,
        objectId: encodedObjectId,
        metaData: favorite.metaData,
        accountId: favorite.accountId,
      });
      if (!items.length) return [];
      return this.mapSmapiItems(items, speakerIP);
    } catch (err) {
      console.warn('[Sonos] SMAPI browse fallback failed:', err);
      return [];
    }
  }

  private findFavoriteMatch(objectId: string, normalized?: string) {
    return this.favoritesList.find((fav) => {
      const ids = [fav?.objectId, fav?.browseId, fav?.id, fav?.rawObjectId].filter(Boolean);
      return ids.includes(objectId) || (normalized ? ids.includes(normalized) : false);
    });
  }

  private resolveSoapObjectId(objectId: string) {
    const normalized = normalizeObjectIdForBrowse(objectId);
    const favorite = this.findFavoriteMatch(objectId, normalized);
    const raw = favorite?.rawObjectId;
    const soapId =
      raw ||
      favorite?.objectIdFromUri ||
      (/%[0-9A-Fa-f]{2}/.test(objectId) ? objectId : encodeURIComponent(normalized));
    return { favorite, normalized, soapId };
  }

  private async tryBrowseFavoriteSmart(
    requestedObjectId: string,
    normalizedObjectId: string,
    speakerIP: string
  ) {
    const { favorite, soapId } = this.resolveSoapObjectId(requestedObjectId);
    const metaData = favorite?.metaData;
    try {
      console.log('[Sonos] Invoking browseFavoriteSmart fallback for', requestedObjectId, 'normalized', normalizedObjectId);
      const { items } = await browseFavoriteSmart(soapId, speakerIP, metaData, {
        emit: (stage: string, data: any) => {
          console.log('[Sonos][browseFavoriteSmart]', stage, data);
        },
      });
      console.log('[Sonos] browseFavoriteSmart returned items:', items.length);
      const mapped = this.mapBrowseResultItems(items, speakerIP);
      if (mapped.length) return mapped;
    } catch (fallbackError) {
      console.warn('[Sonos] browseFavoriteSmart fallback failed:', fallbackError);
    }

    const smapiResults = await this.browseFavoriteViaSmapi(favorite, requestedObjectId, speakerIP);
    if (smapiResults.length) return smapiResults;
    return [];
  }

  private resolveAlternateObjectId(objectId: string): string | null {
    if (!objectId) return null;
    const { favorite } = this.resolveSoapObjectId(objectId);
    if (!favorite) {
      console.warn('[Sonos] resolveAlternateObjectId: no matching favorite for', objectId);
      return null;
    }
    const metaDerived = extractObjectIdFromMeta(favorite.metaData);
    const fallback =
      favorite.rawObjectId ||
      metaDerived ||
      favorite.objectId ||
      favorite.browseId ||
      favorite.id ||
      null;
    console.warn('[Sonos] resolveAlternateObjectId: found candidate', {
      requested: objectId,
      fallback,
      title: favorite.title,
      isContainer: favorite.isContainer,
    });
    return fallback;
  }
  private async sendSoapRequest({ action, service, body, ip }: {
    action: string;
    service: string;
    body: string;
    ip: string;
  }): Promise<string> {
  // Determine the correct endpoint based on the service
  let url: string;
  if (service === 'urn:schemas-upnp-org:service:ContentDirectory:1') {
    // ContentDirectory requires the MediaServer path
    url = `http://${ip}:1400/MediaServer/ContentDirectory/Control`;
  } else if (service === 'urn:schemas-upnp-org:service:AVTransport:1') {
    url = `http://${ip}:1400/MediaRenderer/AVTransport/Control`;
  } else if (service === 'urn:schemas-upnp-org:service:RenderingControl:1') {
    url = `http://${ip}:1400/MediaRenderer/RenderingControl/Control`;
  } else {
    throw new Error(`Unknown SOAP service: ${service}`);
  }

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <s:Body>${body}</s:Body>
    </s:Envelope>`;

  console.log('[Sonos] Sending SOAP request to:', url);
  console.log('[Sonos] SOAPAction:', action);
  console.log('[Sonos] SOAP Body:\n', soapEnvelope);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"${service}#${action}"`,
    },
    body: soapEnvelope,
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`[SOAP ERROR ${res.status}] ${text}`);
    let code: string | undefined;
    try {
      const parsed = await parseStringPromise(text);
      code =
        parsed['s:Envelope']?.['s:Body']?.[0]?.['s:Fault']?.[0]?.detail?.[0]?.UPnPError?.[0]?.errorCode?.[0];
    } catch (e) {
      /* ignore parse errors */
    }
    const codeMessages: Record<string, string> = {
      '701': 'Content not found or invalid object ID',
      '804': 'Unable to add item to queue',
    };
    const codeInfo = code ? `code ${code}${codeMessages[code] ? ` - ${codeMessages[code]}` : ''}` : '';
    const msg = `SOAP Request Failed: ${res.status} ${res.statusText}`;
    throw new Error(codeInfo ? `${msg} (${codeInfo})` : msg);
  }

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

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
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

  // In SonosHandler inside server/sonos/index.ts
  async repeat(state: 'off' | 'all' | 'one') {
  const current = await this.getCurrentPlayMode();
  const pm = (current || 'NORMAL').toUpperCase();

  const shuffleOn = pm === 'SHUFFLE' || pm === 'SHUFFLE_NOREPEAT';

  let NewPlayMode: string;
  switch (state) {
    case 'off':
      NewPlayMode = shuffleOn ? 'SHUFFLE_NOREPEAT' : 'NORMAL';
      break;
    case 'all':
      NewPlayMode = shuffleOn ? 'SHUFFLE' : 'REPEAT_ALL';
      break;
    case 'one':
      // Sonos doesn't combine shuffle with repeat-one
      NewPlayMode = 'REPEAT_ONE';
      break;
    default:
      NewPlayMode = shuffleOn ? 'SHUFFLE_NOREPEAT' : 'NORMAL';
      break;
  }

  await this.execute('SetPlayMode', { InstanceID: 0, NewPlayMode });
  this.sendLog(`Repeat set to ${state} (PlayMode=${NewPlayMode})`);

  // UI notify (DeskThing)
  DeskThing.send({
    app: 'sonos-webapp',
    type: 'repeatState',
    payload: { repeat: state, playMode: NewPlayMode },
  });
}



  async shuffle(state: 'on' | 'off' | 'toggle' = 'toggle') {
  // Read current play mode, map to flags
  const current = await this.getCurrentPlayMode();
  const pm = (current || 'NORMAL').toUpperCase();

  const isShuffle = pm === 'SHUFFLE' || pm === 'SHUFFLE_NOREPEAT';
  let nextShuffle = isShuffle;
  if (state === 'toggle') nextShuffle = !isShuffle;
  if (state === 'on') nextShuffle = true;
  if (state === 'off') nextShuffle = false;

  // Compute current repeat state
  let repeat: 'off' | 'all' | 'one' = 'off';
  if (pm === 'REPEAT_ALL' || pm === 'SHUFFLE') repeat = 'all';
  else if (pm === 'REPEAT_ONE') repeat = 'one';

  // REPEAT_ONE ignores shuffle; force shuffle off in that case
  if (repeat === 'one') nextShuffle = false;

  // Build final Sonos play mode
  let NewPlayMode = 'NORMAL';
  if (repeat === 'one') NewPlayMode = 'REPEAT_ONE';
  else if (nextShuffle && repeat === 'all') NewPlayMode = 'SHUFFLE';
  else if (nextShuffle && repeat === 'off') NewPlayMode = 'SHUFFLE_NOREPEAT';
  else if (!nextShuffle && repeat === 'all') NewPlayMode = 'REPEAT_ALL';
  else NewPlayMode = 'NORMAL';

  await this.execute('SetPlayMode', { InstanceID: 0, NewPlayMode });
  this.sendLog(`Shuffle ${nextShuffle ? 'ON' : 'OFF'} (PlayMode=${NewPlayMode})`);

  // Notify UI using DeskThing (NOT this.send)
  DeskThing.send({
    app: 'sonos-webapp',
    type: 'shuffleState',
    payload: { shuffle: nextShuffle, playMode: NewPlayMode },
  });
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

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
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
          const uri = typeof resVal === 'object' ? resVal?._ : resVal || null;
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
          const attrId = item?.$?.id || '';
          const objectIdFromMeta = extractObjectIdFromMeta(metaData);
          const objectIdFromUri = extractObjectIdFromFavoriteUri(uri || undefined);
          const derivedId = objectIdFromMeta || objectIdFromUri || attrId;
          const normalizedObjectId = derivedId ? normalizeObjectIdForBrowse(derivedId) : attrId;

          let browseId = normalizedObjectId || attrId;
          if (!browseId && attrId) browseId = attrId;

          let formattedAlbumArtURI = albumArtURI;
          if (albumArtURI && !albumArtURI.startsWith('http://') && !albumArtURI.startsWith('https://')) {
            formattedAlbumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
          }

          const encodedAlbumArtURI = formattedAlbumArtURI ? await this.getImageData(formattedAlbumArtURI) : null;

          const favoriteEntry = {
            title,
            uri,
            albumArt: encodedAlbumArtURI || null,
            metaData,
            isContainer,
            id: attrId || normalizedObjectId || title,
            browseId,
            objectId: browseId,
            rawObjectId: derivedId,
            accountId: this.extractAccountId(metaData, uri),
            objectIdFromUri: objectIdFromUri || null,
          };

          console.log('[Sonos][Favorites] mapped favorite:', {
            title,
            attrId,
            objectIdFromMeta,
            objectIdFromUri,
            browseId,
            isContainer,
            uri,
            metaSample: typeof metaData === 'string' ? metaData.slice(0, 500) : '',
          });

          return favoriteEntry;
        })
      );

      this.favoritesList = favoritesList;

      DeskThing.send({ app: 'sonos-webapp', type: 'favorites', payload: favoritesList });
    } catch (error: any) {
      this.sendError(`Error fetching favorites: ${error.response ? error.response.data : error.message}`);
    }
  }

 async browseFavorite(objectId: string, speakerIP: string, attempt = 0) {
  const { soapId, normalized } = this.resolveSoapObjectId(objectId);
  const normalizedObjectId = normalized;
  console.log('[Sonos] Browsing favorite container:', objectId, '(normalized:', normalizedObjectId, ') on', speakerIP, 'attempt:', attempt);

  const soapBody = `
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${soapId}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>0</StartingIndex>
      <RequestedCount>100</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>`;

  try {
    console.log('[Sonos] Preparing to send Browse SOAP request to speakerIP:', speakerIP);
    console.log('[Sonos] SOAP body:\n', soapBody);

    const response = await this.sendSoapRequest({
      ip: speakerIP,
      path: '/MediaServer/ContentDirectory/Control',
      service: 'urn:schemas-upnp-org:service:ContentDirectory:1',
      action: 'Browse',
      body: soapBody,
    });

    console.log('[Sonos] Raw SOAP response:\n', response);

    const result = await parseStringPromise(response);
    const rawResult = result['s:Envelope']['s:Body'][0]['u:BrowseResponse'][0]['Result'][0];

    console.log('[Sonos] Raw DIDL Result (before parsing again):\n', rawResult);

    const didlParser = new xml2js.Parser({ explicitArray: true, ignoreAttrs: false });
    const parsed = await didlParser.parseStringPromise(rawResult);
    console.log('[Sonos] Parsed DIDL object:', parsed);

    const didlLite = parsed['DIDL-Lite'] || {};
    const rootAttrs = didlLite.$ || {};
    const containers = Array.isArray(didlLite.container)
      ? didlLite.container
      : didlLite.container
        ? [didlLite.container]
        : [];
    const items = Array.isArray(didlLite.item)
      ? didlLite.item
      : didlLite.item
        ? [didlLite.item]
        : [];
    const allChildren = [...containers, ...items].filter(Boolean);

    const takeFirst = (value: any) => (Array.isArray(value) ? value[0] : value);
    const ensureAlbumArt = (art: string | undefined | null) => {
      if (!art) return null;
      if (typeof art !== 'string') return null;
      if (/^https?:\/\//i.test(art)) return art;
      const bareHost = speakerIP.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const hostWithPort = bareHost.includes(':') ? bareHost : `${bareHost}:1400`;
      const path = art.startsWith('/') ? art : `/${art}`;
      return `http://${hostWithPort}${path}`;
    };
    const builder = new xml2js.Builder({ headless: true });

    console.log('[Sonos] Found DIDL containers:', containers.length, 'items:', items.length);

    let browseResults = allChildren.map((child) => {
      const title = takeFirst(child?.['dc:title']) || 'Unknown';
      const rawRes = takeFirst(child?.res);
      let uri: string | null = null;
      if (rawRes) {
        uri = typeof rawRes === 'object' ? rawRes._ || null : rawRes;
      }
      const albumArtVal = takeFirst(child?.['upnp:albumArtURI']);
      const upnpClass = takeFirst(child?.['upnp:class']) || '';
      const isContainer = typeof upnpClass === 'string' && upnpClass.includes('object.container');
      const meta = builder.buildObject({
        'DIDL-Lite': {
          $: rootAttrs,
          [isContainer ? 'container' : 'item']: child,
        },
      });

      return {
        uri: uri || null,
        title,
        albumArt: this.ensureAlbumArtAbsolute(albumArtVal, speakerIP),
        metaData: meta,
        isContainer,
        id: child?.$?.id || '',
        browseId: child?.$?.id || '',
      };
    });

    console.log('[Sonos] Parsed browse results count:', browseResults.length);
    if (browseResults[0]) {
      console.log('[Sonos] First browse result sample:', browseResults[0]);
    }

    if (!browseResults.length) {
      const fallbackResults = await this.tryBrowseFavoriteSmart(objectId, normalizedObjectId, speakerIP);
      if (fallbackResults.length) {
        console.log('[Sonos] Using browseFavoriteSmart fallback results:', fallbackResults.length);
        browseResults = fallbackResults;
      } else {
        console.warn('[Sonos] No browse results returned for objectId', objectId, 'normalized', normalizedObjectId);
      }
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'browseFavoriteResults',
      payload: {
        objectId: normalizedObjectId,
        items: browseResults,
      },
    });

    return browseResults;
  } catch (err) {
    console.error('[Sonos] Error in browseFavorite:', err);

    const message = err instanceof Error ? err.message : 'Unknown error';

    if (!attempt) {
      const fallbackResults = await this.tryBrowseFavoriteSmart(objectId, normalizedObjectId, speakerIP);
      if (fallbackResults.length) {
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'browseFavoriteResults',
          payload: {
            objectId: normalizedObjectId,
            items: fallbackResults,
          },
        });
        return fallbackResults;
      }
    }

    const shouldRetry = !attempt && message?.includes('701');
    if (shouldRetry) {
      const fallbackId = this.resolveAlternateObjectId(objectId);
      if (fallbackId && fallbackId !== objectId) {
        const normalizedFallback = normalizeObjectIdForBrowse(fallbackId);
        console.warn(`[Sonos] Retrying browseFavorite with fallback objectId ${fallbackId} (normalized ${normalizedFallback})`);
        return this.browseFavorite(fallbackId, speakerIP, attempt + 1);
      } else {
        console.warn('[Sonos] No alternate objectId available for retry', { requested: objectId, fallbackId });
      }
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'browseFavoriteError',
      payload: {
        objectId: normalizedObjectId,
        message,
      },
    });

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'browseFavoriteResults',
      payload: {
        objectId: normalizedObjectId,
        items: [],
      },
    });

    return [];
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
  
  
  async playFavoriteOnSpeakers(uri: any, speakerUUIDs: string[], metaData?: string) {
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
    await this.playFavorite(uriString, metaData);

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
