import axios from 'axios';
import { DeskThing as DK } from 'deskthing-server';
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
  currentVolume: number = 25;
  pollingInterval: any = null;
  trackPositionInterval: any = null;
  avTransport = 'MediaRenderer/AVTransport';
  contentDirectory = 'MediaServer/ContentDirectory';
  zoneGroupTopology = 'ZoneGroupTopology';
  renderingControl = 'MediaRenderer/RenderingControl';
  zoneGroupState: any;
  name = 'AVTransport';
  favoritesList: any[] = []; // Store favorites here
  deviceUUID: string | null = null; // Store the device UUID

  // Store the last known track info
  lastKnownSongData: any = null;

  // Method to execute the SOAP command
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
              <u:${action} xmlns:u="urn:schemas-upnp-org:service:${this.name}:1">
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

      // Extract the response body
      const responseBody = result['s:Envelope']['s:Body'][`u:${action}Response`] || {};
      return responseBody;

    } catch (error: any) {
      this.sendError(`Error executing ${action}: ${error.response ? error.response.data : error.message}`);
      throw error;
    }
  }

  // Helper method to escape XML special characters
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

  // Parse URI query parameters
  parseUriQuery(uri: string): Record<string, string> {
    const queryIndex = uri.indexOf('?');
    if (queryIndex === -1) {
      return {};
    }
    const queryString = uri.substring(queryIndex + 1);
    const pairs = queryString.split('&');
    const queryParams: Record<string, string> = {};
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      queryParams[key] = decodeURIComponent(value || '');
    }
    return queryParams;
  }

  // Fetch and send favorites to the frontend
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

      // Parse the SOAP response to extract favorites
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

      // Ensure items is always an array
      if (!Array.isArray(items)) {
        items = [items];
      }

      const favoritesList = await Promise.all(items.map(async (item: any) => {
        const title = item['dc:title'] || 'Unknown Title';
        const uri = item['res'] || null;
        const albumArtURI = item['upnp:albumArtURI'] || null;
        const metaData = item['r:resMD'] || item['resMD'] || '';

        // Ensure the album art URI is properly formatted
        let formattedAlbumArtURI = albumArtURI;
        if (albumArtURI && !albumArtURI.startsWith('http://') && !albumArtURI.startsWith('https://')) {
          formattedAlbumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
        }

        // Fetch and encode the album art as base64
        const encodedAlbumArtURI = formattedAlbumArtURI ? await this.getImageData(formattedAlbumArtURI) : null;

        return {
          title,
          uri,
          albumArt: encodedAlbumArtURI || null,
          metaData, // Store metadata as-is
        };
      }));

      // Store the favorites list for later use
      this.favoritesList = favoritesList;

      // Send the favorites data to the frontend
      DK.getInstance().sendDataToClient({ app: 'client', type: 'favorites', payload: favoritesList });
      DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'favorites', payload: favoritesList });

    } catch (error: any) {
      this.sendError(`Error fetching favorites: ${error.response ? error.response.data : error.message}`);
    }
  }

  // Method to play a favorite
  async playFavorite(uri: string, metaData: string | null = null) {
    try {
      this.sendLog(`Attempting to play favorite URI: ${uri}`);

      // If metaData is not provided, look it up in favoritesList
      if (!metaData) {
        const favorite = this.favoritesList.find(fav => fav.uri === uri);
        if (favorite && favorite.metaData) {
          metaData = favorite.metaData;
        } else {
          throw new Error(`Metadata not found for URI: ${uri}`);
        }
      }

      // Parse metadata to extract upnp:class
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const parsedMetaData = await parser.parseStringPromise(metaData);
      const item = parsedMetaData['DIDL-Lite']['item'];
      const upnpClass = item['upnp:class'];

      this.sendLog(`Using metadata with upnp:class: ${upnpClass}`);

      // Decide how to handle based on upnpClass
      if (
        upnpClass.includes('object.container.playlistContainer') ||
        upnpClass.includes('object.container.album.musicAlbum')
      ) {
        // For playlists and albums, add to queue
        await this.clearQueue();
        const response = await this.addURIToQueue(uri, metaData);
        const trackNr = response.FirstTrackNumberEnqueued || 1;

        this.sendLog(`Added URI to queue. First track number enqueued: ${trackNr}`);

        // Set AVTransportURI to the queue
        await this.playFromQueue();

        // Seek to the added track
        await this.seek('TRACK_NR', trackNr);

        // Start playback
        await this.play();

        this.sendLog(`Playing favorite from queue: ${item['dc:title']}`);
      } else {
        // For other items, play directly
        await this.setAVTransportURI(uri, metaData);
        await this.play();
        this.sendLog(`Playing favorite: ${item['dc:title']}`);
      }

      // Update track info immediately
      await this.getTrackInfo();

    } catch (error: any) {
      this.sendError(`Error playing favorite: ${error.message}`);
    }
  }

  // Method to add URI to queue
  async addURIToQueue(uri: string, metadata: string) {
    return this.execute('AddURIToQueue', {
      InstanceID: 0,
      EnqueuedURI: uri,
      EnqueuedURIMetaData: metadata,
      DesiredFirstTrackNumberEnqueued: 0,
      EnqueueAsNext: 0,
    });
  }

  // Method to clear the queue
  async clearQueue() {
    return this.execute('RemoveAllTracksFromQueue', { InstanceID: 0 });
  }

  // Method to set AVTransportURI to queue
  async playFromQueue() {
    const uuid = await this.getDeviceUUID();
    const queueURI = `x-rincon-queue:${uuid}#0`;
    await this.setAVTransportURI(queueURI, '');
  }

  // Method to seek
  async seek(unit: string, target: any) {
    return this.execute('Seek', { InstanceID: 0, Unit: unit, Target: target });
  }

  // Method to retrieve the device UUID
  async getDeviceUUID(): Promise<string> {
    if (this.deviceUUID) {
      // If we've already retrieved the UUID, return it
      return this.deviceUUID;
    }

    if (!this.deviceIP) {
      throw new Error('Sonos device IP is not set.');
    }

    try {
      const response = await axios.get(`http://${this.deviceIP}:${this.port}/status/zp`);
      const data = response.data;

      // Parse the XML response to get the UUID
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const result = await parser.parseStringPromise(data);
      const localUID = result.ZPSupportInfo?.ZPInfo?.LocalUID || result.ZPInfo?.LocalUID;

      if (!localUID) {
        throw new Error('Unable to retrieve device UUID.');
      }

      this.deviceUUID = localUID;
      return localUID;
    } catch (error: any) {
      this.sendError('Error retrieving device UUID: ' + error.message);
      throw error;
    }
  }

  // Method to set the AVTransport URI
  async setAVTransportURI(uri: string, metadata: string) {
    return this.execute('SetAVTransportURI', {
      CurrentURI: uri,
      CurrentURIMetaData: metadata || '',
    });
  }

  // Method to play
  async play() {
    await this.execute('Play', { Speed: '1' });
    this.startPollingTrackInfo(5000); // Poll every 5 seconds
  }

  // Method to pause
  async pause() {
    await this.execute('Pause');
    this.stopPollingTrackInfo();
  }

  // Method to go to next track
  async next() {
    await this.execute('Next');
    await this.getTrackInfo();
  }

  // Method to go to previous track
  async previous() {
    await this.execute('Previous');
    await this.getTrackInfo();
  }

  // Method to start polling
  startPollingTrackInfo(interval = 5000) {
    // Default interval is 5 seconds
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval); // Clear any existing interval
    }

    // Set the polling interval
    this.pollingInterval = setInterval(() => {
      this.getTrackInfo();
    }, interval);
  }

  // Method to stop polling
  stopPollingTrackInfo() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Helper method to send logs
  async sendLog(message: string) {
    DK.getInstance().sendLog(message);
  }

  // Helper method to send errors
  async sendError(message: string) {
    DK.getInstance().sendError(message);
  }

  // Fetch track info
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

        // Access elements with namespace prefixes
        albumArtURI = item && (item['upnp:albumArtURI'] || item['albumArtURI']) || null;

        let streamContent = item && (item['r:streamContent'] || item['streamContent']);

        if (streamContent) {
          // For radio streams and some services
          this.sendLog(`streamContent: ${streamContent}`);

          // Adjusted parsing logic to handle both '=' and space-separated key-value pairs
          const data: { [key: string]: string } = {};

          // Split by '|'
          const pairs = streamContent.split('|');

          for (const pair of pairs) {
            const indexOfEquals = pair.indexOf('=');
            if (indexOfEquals > -1) {
              // Key and value are separated by '='
              const key = pair.substring(0, indexOfEquals).trim().toUpperCase();
              const value = pair.substring(indexOfEquals + 1).trim();
              data[key] = value;
            } else {
              // Key and value are separated by first space
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

      // Only update if we have valid data
      if (trackInfo || artist || album || albumArtURI) {
        const songData = {
          track_name: trackInfo || (this.lastKnownSongData && this.lastKnownSongData.track_name) || 'Unknown Track',
          artist: artist || (this.lastKnownSongData && this.lastKnownSongData.artist) || 'Unknown Artist',
          album: album || (this.lastKnownSongData && this.lastKnownSongData.album) || 'Unknown Album',
          thumbnail: albumArtURI ? await this.getImageData(albumArtURI) : (this.lastKnownSongData && this.lastKnownSongData.thumbnail) || null,
        };

        // Update last known song data
        this.lastKnownSongData = songData;

        this.sendLog(`Fetched Track Info: ${songData.artist} - ${songData.track_name}, Album - ${songData.album}, AlbumArtURI - ${albumArtURI}`);

        DK.getInstance().sendDataToClient({ app: 'client', type: 'song', payload: songData });
        DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'song', payload: songData });
      } else {
        this.sendLog('No valid track info received. Retaining last known track info.');
      }

    } catch (error: any) {
      this.sendError('Error getting track info: ' + error.message);
      DK.getInstance().sendDataToClient({
        app: 'client',
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

  // Helper function to fetch the image data and convert it to base64
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

  // Method to set volume
  async setVolume(volume: number) {
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

    this.sendLog(`Setting volume to ${volume}`);
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

      this.currentVolume = volume;
      DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'volume', payload: volume });
      return response.data;
    } catch (error: any) {
      this.sendError(`Error setting volume: ${error.response ? error.response.data : error.message}`);
      throw error;
    }
  }

  // Method to get current volume
  async getCurrentVolume(): Promise<number> {
    if (!this.deviceIP) throw new Error('Sonos device IP is not set.');

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

    try {
      const response = await axios.post(url, request, {
        headers: {
          'SOAPAction': soapAction,
          'Content-Type': 'text/xml; charset=utf-8',
        },
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const volume = parseInt(result['s:Envelope']['s:Body']['u:GetVolumeResponse']['CurrentVolume'], 10);

      this.currentVolume = volume;
      return volume;
    } catch (error: any) {
      console.error('Error getting current volume:', error);
      throw error;
    }
  }

  // Method to check for refresh (update track info)
  async checkForRefresh() {
    this.sendLog('Checking for refresh...');
    await this.getTrackInfo();
  }
}

export default SonosHandler;
