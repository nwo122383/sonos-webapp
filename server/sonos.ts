import axios from 'axios';
import { DeskThing as DK, Settings } from 'deskthing-server';
import xml2js from 'xml2js';

export type SongData = {
  album: string | null;
  artist: string | null;
  playlist: string | null;
  playlist_id: string | null;
  track_name: string;
  shuffle_state: boolean | null;
  repeat_state: 'off' | 'all' | 'track';
  is_playing: boolean;
  can_fast_forward: boolean;
  can_skip: boolean;
  can_like: boolean;
  can_change_volume: boolean;
  can_set_output: boolean;
  track_duration: number | null;
  track_progress: number | null;
  volume: number;
  thumbnail: string | null;
  device: string | null;
  id: string | null;
  device_id: string | null;
};

class SonosHandler {
  deviceIP: string | null = null;
  port: number = 1400;
  controlURL = `/MediaRenderer/AVTransport/Control`;
  avTransport = 'AVTransport';
  renderingControl = 'RenderingControl';
  favoritesList: any[] = [];
  deviceUUID: string | null = null;
  lastKnownSongData: any = null;
  pollingInterval: any = null;
  selectedSpeakerUUIDs: string | null = null;
  speakersList: { [uuid: string]: { ip: string; zoneName: string } } = {};
  selectedVolumeSpeakers: string[] = [];
  selectedPlaybackSpeakers: string[] = [];

  // Initialize shuffle and repeat states
  shuffleState: boolean = false;
  repeatState: 'off' | 'all' | 'one' = 'off';
  // Implement getSpeakerIPByUUID
  async getSpeakerIPByUUID(uuid: string): Promise<string | null> {
    if (this.speakersList && this.speakersList[uuid]) {
      return this.speakersList[uuid].ip;
    }
    // If not found, refresh the speakers list
    await this.getZoneGroupState();
    if (this.speakersList[uuid]) {
      return this.speakersList[uuid].ip;
    }
    return null;
  }
// Select volume control speakers
  async selectVolumeSpeakers(uuids: string[]) {
    this.selectedVolumeSpeakers = uuids;
    this.sendLog(`Selected volume speakers: ${uuids.join(', ')}`);
  }
  // Select playback control speakers
async selectPlaybackSpeakers(uuids: string[]) {
  this.selectedPlaybackSpeakers = uuids;
  this.sendLog(`Selected playback speakers: ${uuids.join(', ')}`);
}
  // Select speaker
  async selectSpeakers(uuids: string[]) {
    this.selectedSpeakerUUIDs = uuids;
    this.sendLog(`Selected speakers: ${uuids.join(', ')}`);
  
    if (uuids.length > 0) {
      const firstSpeakerIP = await this.getSpeakerIPByUUID(uuids[0]);
      if (firstSpeakerIP) {
        this.deviceIP = firstSpeakerIP;
        this.sendLog(`Device IP set to: ${this.deviceIP}`);
      } else {
        this.sendError(`IP not found for speaker UUID: ${uuids[0]}`);
      }
    } else {
      this.deviceIP = null;
      this.sendLog('No speakers selected. Device IP unset.');
    }
  }
  // Method to execute SOAP commands
  async execute(action: string, params: any = {}) {
    if (!this.deviceIP) {
      throw new Error('Sonos device IP is not set.');
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

  // Helper to escape XML special characters
  escape(input: string) {
    if (typeof input === 'string') {
      return input.replace(/[<>&'"]/g, (c) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      }[c]));
    }
    return input;
  }
   // Implement addSpeakerToGroup
   async addSpeakerToGroup(speakerIP: string, coordinatorIP: string) {
    try {
      if (!coordinatorIP || !speakerIP) {
        throw new Error('Coordinator IP or speaker IP is not provided');
      }

      const coordinatorUUID = await this.getDeviceUUID(coordinatorIP);

      const uri = `x-rincon:${coordinatorUUID}`;

      const originalDeviceIP = this.deviceIP;

      this.deviceIP = speakerIP; // Set the device IP to the speaker we want to add

      await this.setAVTransportURI(uri, '');

      this.sendLog(`Speaker ${speakerIP} added to group with coordinator: ${coordinatorUUID}`);

      this.deviceIP = originalDeviceIP; // Restore the original device IP
    } catch (error: any) {
      this.sendError('Error adding speaker to group: ' + error.message);
      console.error('Error adding speaker to group:', error);
    }
  }
// Modify leaveGroup to accept speakerIP
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

   
  // Fetch zone group state
  async getZoneGroupState() {
    const url = `http://${this.deviceIP}:${this.port}/ZoneGroupTopology/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"`;
    const request = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
          <s:Body>
              <u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1"></u:GetZoneGroupState>
          </s:Body>
      </s:Envelope>`;
  
    try {
      const response = await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });
  
      // Adjusted parser options to strip namespace prefixes
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        ignoreAttrs: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
      });
      const result = await parser.parseStringPromise(response.data);
  
      // Access the properties without namespace prefixes
      const zoneGroupState = result['Envelope']['Body']['GetZoneGroupStateResponse']['ZoneGroupState'];
  
      // Parse the ZoneGroupState XML
      const xmlParser = new xml2js.Parser({
        explicitArray: false,
        explicitRoot: false,
        mergeAttrs: true,
        ignoreAttrs: false,
        xmlns: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
      });
      const zoneGroupStateParsed = await xmlParser.parseStringPromise(zoneGroupState);
  
      // Log the parsed structure for debugging
      console.log('Parsed ZoneGroupState:', JSON.stringify(zoneGroupStateParsed, null, 2));
  
      const zoneGroups = zoneGroupStateParsed.ZoneGroups?.ZoneGroup;
  
      if (!zoneGroups) {
        throw new Error('No ZoneGroups found in ZoneGroupState.');
      }
  
      const groups = Array.isArray(zoneGroups) ? zoneGroups : [zoneGroups];
  
      const speakersList: { [uuid: string]: { ip: string; zoneName: string } } = {};
  
      for (const group of groups) {
        const members = Array.isArray(group.ZoneGroupMember)
          ? group.ZoneGroupMember
          : [group.ZoneGroupMember];
  
        for (const member of members) {
          const uuid = member.UUID;
          const location = member.Location;
          const zoneName = member.ZoneName;
          const ip = this.extractIPAddress(location);
  
          if (uuid && ip) {
            speakersList[uuid] = { ip, zoneName };
          }
        }
      }
  
      // Update speakersList
      this.speakersList = speakersList;
  
      // Send to frontend
      DK.getInstance().sendDataToClient({
        app: 'sonos-webapp',
        type: 'zoneGroupState',
        payload: zoneGroupState,
      });
  
      return zoneGroupState;
    } catch (error: any) {
      this.sendError('Error getting zone group state: ' + error.message);
      throw error;
    }
  }
  
  // Join group
  async joinGroup(coordinatorIP: string, deviceIP: string) {
    try {
      if (!coordinatorIP || !deviceIP) {
        throw new Error('Coordinator IP or device IP is not provided');
      }
  
      const coordinatorUUID = await this.getDeviceUUID(coordinatorIP);
  
      const uri = `x-rincon:${coordinatorUUID}`;
  
      const originalDeviceIP = this.deviceIP;
  
      this.deviceIP = deviceIP; // Temporarily set the device IP to the device we want to add
  
      await this.setAVTransportURI(uri, '');
  
      this.sendLog(`Device ${deviceIP} joined group with coordinator: ${coordinatorUUID}`);
  
      this.deviceIP = originalDeviceIP; // Restore the original device IP
    } catch (error: any) {
      this.sendError('Error joining group: ' + error.message);
      console.error('Error joining group:', error);
    }
  }

  

  // Get device UUID
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
  
    // Method to fast forward
    async fastForward(seconds = 15) {
      try {
        const currentPosition = await this.getCurrentPosition();
        const newPosition = currentPosition + seconds;
        await this.seekToTime(newPosition);
      } catch (error: any) {
        this.sendError('Error fast forwarding: ' + error.message);
      }
    }
  
    // Method to rewind
    async rewind(seconds = 15) {
      try {
        const currentPosition = await this.getCurrentPosition();
        const newPosition = Math.max(currentPosition - seconds, 0);
        await this.seekToTime(newPosition);
      } catch (error: any) {
        this.sendError('Error rewinding: ' + error.message);
      }
    }
  
    // Helper method to get current track position in seconds
    async getCurrentPosition(): Promise<number> {
      const action = 'GetPositionInfo';
      const params = { InstanceID: 0 };
      const result = await this.execute(action, params);
      const relTime = result['RelTime']; // Format: hh:mm:ss
      const timeParts = relTime.split(':').map(Number);
      const seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
      return seconds;
    }
  
    // Helper method to seek to a specific time in seconds
    async seekToTime(positionInSeconds: number) {
      const hours = Math.floor(positionInSeconds / 3600);
      const minutes = Math.floor((positionInSeconds % 3600) / 60);
      const seconds = positionInSeconds % 60;
      const target = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
      await this.seek('REL_TIME', target);
    }
  
    // Helper method to pad numbers with leading zeros
    padZero(value: number): string {
      return value.toString().padStart(2, '0');
    }
  
    // Method to set repeat mode
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
  
    // Method to set shuffle mode
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
      const response = await axios.post(url, request, {
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
  
  // Fetch and send favorites to frontend
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

      const metaParser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
      const metaResult = await metaParser.parseStringPromise(favoritesResult);
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
          const uri = item['res'] || null;
          const albumArtURI = item['upnp:albumArtURI'] || null;
          const metaData = item['r:resMD'] || item['resMD'] || '';

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
          };
        })
      );

      this.favoritesList = favoritesList;

      DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'favorites', payload: favoritesList });
    } catch (error: any) {
      this.sendError(`Error fetching favorites: ${error.response ? error.response.data : error.message}`);
    }
  }
   // Implement playFavoriteOnSpeakers
   async playFavoriteOnSpeakers(uri: string, speakerUUIDs: string[]) {
    if (speakerUUIDs.length === 0) {
      throw new Error('No speakers selected to play the favorite.');
    }
    // Select the first speaker as the coordinator
    const coordinatorUUID = speakerUUIDs[0];
    const coordinatorIP = await this.getSpeakerIPByUUID(coordinatorUUID);
    if (!coordinatorIP) {
      throw new Error('Coordinator speaker IP not found.');
    }
  
    // Group other speakers with the coordinator
    for (let i = 1; i < speakerUUIDs.length; i++) {
      const speakerUUID = speakerUUIDs[i];
      const speakerIP = await this.getSpeakerIPByUUID(speakerUUID);
      if (speakerIP) {
        await this.addSpeakerToGroup(speakerIP, coordinatorIP);
      }
    }
  
    // Set the deviceIP to the coordinator
    this.deviceIP = coordinatorIP;
  
    // Play the favorite on the coordinator
    await this.playFavorite(uri);

    // Update the selectedSpeakerUUIDs to include the coordinator
      if (!this.selectedSpeakerUUIDs.includes(coordinatorUUID)) {
        this.selectedSpeakerUUIDs.unshift(coordinatorUUID);
      }
    }
  
   
  
  // Play favorite
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
        this.sendLog(`Playing favorite: ${item['dc:title']}`);
      }

      await this.getTrackInfo();
    } catch (error: any) {
      this.sendError(`Error playing favorite: ${error.message}`);
    }
  }

  // Add URI to queue
  async addURIToQueue(uri: string, metadata: string) {
    return this.execute('AddURIToQueue', {
      InstanceID: 0,
      EnqueuedURI: uri,
      EnqueuedURIMetaData: metadata,
      DesiredFirstTrackNumberEnqueued: 0,
      EnqueueAsNext: 0,
    });
  }

  // Clear the queue
  async clearQueue() {
    return this.execute('RemoveAllTracksFromQueue', { InstanceID: 0 });
  }

  // Set AVTransportURI to queue
  async playFromQueue() {
    const uuid = await this.getDeviceUUID();
    const queueURI = `x-rincon-queue:${uuid}#0`;
    await this.setAVTransportURI(queueURI, '');
  }

  // Seek method
  async seek(unit: string, target: any) {
    return this.execute('Seek', { InstanceID: 0, Unit: unit, Target: target });
  }

  // Set AVTransportURI
  async setAVTransportURI(uri: string, metadata: string) {
    return this.execute('SetAVTransportURI', {
      CurrentURI: uri,
      CurrentURIMetaData: metadata || '',
    });
  }

  // Implement play
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

  // Implement pause
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

  // Implement next
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

  // Implement previous
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


  // Start polling track info
  startPollingTrackInfo(interval = 5000) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.getTrackInfo();
    }, interval);
  }

  // Stop polling track info
  stopPollingTrackInfo() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Get track info
  async getTrackInfo() {
    const action = 'GetPositionInfo';
    const params = { InstanceID: 0 };

    try {
      const result = await this.execute(action, params);

      const trackData = result;
      const trackMetaData = trackData['TrackMetaData'];

      this.sendLog(`Track MetaData: ${trackMetaData}`);

      let trackInfo = null;
      let album = null;
      let artist = null;
      let albumArtURI = null;

      if (trackMetaData && trackMetaData.includes('<DIDL-Lite')) {
        const parser = new xml2js.Parser({
          explicitArray: false,
          ignoreAttrs: true,
        });
        const metaResult = await parser.parseStringPromise(trackMetaData);

        const item = metaResult['DIDL-Lite'] && metaResult['DIDL-Lite']['item'];

        this.sendLog(`Parsed item: ${JSON.stringify(item)}`);
        this.sendLog(`Available keys in item: ${Object.keys(item).join(', ')}`);

        albumArtURI = item && (item['upnp:albumArtURI'] || item['albumArtURI']) || null;

        let streamContent = item && (item['r:streamContent'] || item['streamContent']);

        if (streamContent) {
          this.sendLog(`streamContent: ${streamContent}`);

          const data: { [key: string]: string } = {};

          const pairs = streamContent.split('|');

          for (const pair of pairs) {
            const indexOfEquals = pair.indexOf('=');
            if (indexOfEquals > -1) {
              const key = pair.substring(0, indexOfEquals).trim().toUpperCase();
              const value = pair.substring(indexOfEquals + 1).trim();
              data[key] = value;
            } else {
              const [key, ...valueParts] = pair.trim().split(' ');
              if (key && valueParts.length > 0) {
                data[key.trim().toUpperCase()] = valueParts.join(' ').trim();
              }
            }
          }

          artist = data['ARTIST'] || data['ARTIST_NAME'] || null;
          trackInfo = data['TITLE'] || data['TRACK'] || null;
          album = data['ALBUM'] || null;
        } else {
          artist = item && (item['dc:creator'] || item['creator']) || null;
          trackInfo = item && (item['dc:title'] || item['title']) || null;
          album = item && (item['upnp:album'] || item['album']) || null;
        }

        if (albumArtURI && (albumArtURI.startsWith('http://') || albumArtURI.startsWith('https://'))) {
          this.sendLog(`Album art URI: ${albumArtURI}`);
        } else if (albumArtURI) {
          albumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
          this.sendLog(`Album art URI updated with device IP: ${albumArtURI}`);
        }
      } else {
        this.sendLog('Track metadata not found or not in expected format. Skipping update.');
      }

      if (trackInfo || artist || album || albumArtURI) {
        const songData = {
          track_name: trackInfo || (this.lastKnownSongData && this.lastKnownSongData.track_name) || 'Unknown Track',
          artist: artist || (this.lastKnownSongData && this.lastKnownSongData.artist) || 'Unknown Artist',
          album: album || (this.lastKnownSongData && this.lastKnownSongData.album) || 'Unknown Album',
          thumbnail: albumArtURI
            ? await this.getImageData(albumArtURI)
            : (this.lastKnownSongData && this.lastKnownSongData.thumbnail) || null,
        };

        this.lastKnownSongData = songData;

        this.sendLog(
          `Fetched Track Info: ${songData.artist} - ${songData.track_name}, Album - ${songData.album}, AlbumArtURI - ${albumArtURI}`
        );
        DK.getInstance().sendDataToClient({ app: 'client', type: 'song', payload: songData });
        DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'song', payload: songData });
      } else {
        this.sendLog('No valid track info received. Retaining last known track info.');
      }
    } catch (error: any) {
            DK.getInstance().sendDataToClient({
        app: 'sonos-webapp',
        type: 'song',
        payload: this.lastKnownSongData || {
          track_name: 'Unknown Track',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          thumbnail: null,
        },
      });
    }
  }

   // Update methods to use selectedSpeakerUUIDs
   async setVolume(volume: number, speakerUUIDs: string[] = []) {
    const speakersToAdjust = speakerUUIDs.length > 0 ? speakerUUIDs : this.selectedVolumeSpeakers;
    if (speakersToAdjust.length === 0) {
      throw new Error('No volume speakers selected to adjust volume.');
    }
  
    for (const uuid of speakersToAdjust) {
      const speakerIP = await this.getSpeakerIPByUUID(uuid);
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
      } else {
        this.sendError(`Speaker IP not found for UUID: ${uuid}`);
      }
    }
  

    // Send volume change back to frontend
    DK.getInstance().sendDataToClient({
      app: 'sonos-webapp',
      type: 'volumeChange',
      payload: { volume },
    });
  }



   // Get current volume from one of the selected speakers
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
  
      let volume: number; // Declare volume here
  
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
  
      return volume; // Now volume is accessible here
    } else {
      throw new Error(`Speaker IP not found for UUID: ${uuid}`);
    }
  }

// Define the extractIPAddress method
extractIPAddress(url: string): string | null {
  try {
    const parsedURL = new URL(url);
    return parsedURL.hostname;
  } catch (error) {
    this.sendError('Error parsing URL to extract IP address: ' + error.message);
    return null;
  }
}

  // Helper function to fetch image data and convert to base64
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

  // Helper methods
  async sendLog(message: string) {
    DK.getInstance().sendLog(message);
  }

  async sendError(message: string) {
    DK.getInstance().sendError(message);
  }

  // Check for refresh
  async checkForRefresh() {
    this.sendLog('Checking for refresh...');
    await this.getTrackInfo();
  }
}

export default SonosHandler;
