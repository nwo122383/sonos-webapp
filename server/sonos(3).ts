import axios from 'axios';
import xml2js from 'xml2js';
import { DeskThing as DK, Settings } from 'deskthing-server';
import { getImageData } from './utility';  // Import getImageData from utility.ts

export type SongData = {
    album: string | null
    artist: string | null
    playlist: string | null
    playlist_id: string | null
    track_name: string
    shuffle_state: boolean | null
    repeat_state: 'off' | 'all' | 'track' 
    is_playing: boolean
    can_fast_forward: boolean
    can_skip: boolean
    can_like: boolean
    can_change_volume: boolean
    can_set_output: boolean 
    track_duration: number | null
    track_progress: number | null
    volume: number 
    thumbnail: string | null 
    device: string | null 
    id: string | null 
    device_id: string | null 
  }

class MusicService {
    static URI_TYPE = {
        album: {
            prefix: 'x-rincon-cpcontainer:1004206c',
            key: '00040000',
            class: 'object.container.album.musicAlbum'
        },
        episode: {
            prefix: '',
            key: '00032020',
            class: 'object.item.audioItem.musicTrack'
        },
        track: {
            prefix: '',
            key: '00032020',
            class: 'object.item.audioItem.musicTrack'
        },
        show: {
            prefix: 'x-rincon-cpcontainer:1006206c',
            key: '1006206c',
            class: 'object.container.playlistContainer'
        },
        song: {
            prefix: '',
            key: '10032020',
            class: 'object.item.audioItem.musicTrack'
        },
        playlist: {
            prefix: 'x-rincon-cpcontainer:1006206c',
            key: '1006206c',
            class: 'object.container.playlistContainer'
        },
        radio: {
            prefix: 'x-sonosapi-stream:',
            key: 'F00092020',
            class: 'object.item.audioItem.audioBroadcast'
        }
    }

    static FACTORIES = [
        (uri) => {
            const m = uri.match(/spotify.*[:/](album|episode|playlist|show|track)[:/](\w+)/);
            return m ? new MusicService(2311, m[1], `spotify:${m[1]}:${m[2]}`) : null;
        },
        (uri) => {
            const m = uri.match(/https:\/\/tidal.*[:/](album|track|playlist)[:/]([\w-]+)/);
            return m ? new MusicService(44551, m[1], `${m[1]}/${m[2]}`) : null;
        },
        (uri) => {
            const m = uri.match(/https:\/\/www.deezer.*[:/](album|track|playlist)[:/]([\w-]+)/);
            return m ? new MusicService(519, m[1], `${m[1]}-${m[2]}`) : null;
        },
        (uri) => {
            const m = uri.match(/https:\/\/music\.apple\.com\/\w+\/(album|playlist)\/[^/]+\/(?:pl\.)?([-a-zA-Z0-9]+)(?:\?i=(\d+))?/);
            if (!m) return null;

            const type = m[3] ? 'song' : m[1];
            const id = m[3] || m[2];
            return new MusicService(52231, type, `${type}:${id}`);
        },
        (uri) => {
            const m = uri.match(/https:\/\/tunein.com\/(radio)\/.*(s\d+)/);
            return m ? new MusicService(65031, m[1], m[2], 254) : null;
        }
    ]

    static parse(uri) {
        for (const factory of MusicService.FACTORIES) {
            const service = factory(uri);
            if (service) return service;
        }
    }

    constructor(serviceId, type, uri, broadcastId) {
        this.serviceId = serviceId;
        this.type = MusicService.URI_TYPE[type];
        this.encodedUri = encodeURIComponent(uri);
        this.broadcastId = broadcastId;
    }

    get metadata() {
        return `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
            <item id="${this.type.key}${this.encodedUri}" restricted="true">
                <dc:title>Stream Deck</dc:title><upnp:class>${this.type.class}</upnp:class>
                <desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${this.serviceId}_</desc>
            </item>
        </DIDL-Lite>`;
    }

    get uri() {
        return this.type.prefix + this.encodedUri + (this.broadcastId ? `?sid=${this.broadcastId}` : '');
    }
}


class SonosHandler {
    deviceIP: string | null = null;
    port: number = 1400;
    controlURL = `/MediaRenderer/AVTransport/Control`;
    currentVolume: number = 25;
    pollingInterval: any = null;
    trackPositionInterval: any = null;

    
// Method to start polling
startPollingTrackInfo(interval = 30000) { // 30 seconds interval
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



async clearQueue() {
const action = 'RemoveAllTracksFromQueue';
const params = {
    InstanceID: 0
};

try {
    this.sendLog('Clearing the queue...');
    await this.execute(action, params);
    this.sendLog('Queue cleared.');
} catch (error) {
    this.sendError('Error clearing queue: ' + error.message);
    throw error;
}
}



    setDeviceIP(ip: string){
        this.deviceIP = ip;
    }

    
    

    constructor() {
        // Initialize DeskThing
    }

    async sendLog(message: string) {
        DK.getInstance().sendLog(message);
    }

    async sendError(message: string) {
        DK.getInstance().sendError(message);
    }

    async execute(action: string, params: any) {
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
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${xmlParams}</u:${action}></s:Body>
            </s:Envelope>`;

        this.sendLog(`Sending SOAP Request to ${url} with action ${action}`);
        this.sendLog(`SOAP Request Content: ${request}`);

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

            this.sendLog(`SOAP Response: ${response.data}`);
            return response.data;
        } catch (error) {
            this.sendError(`Error executing ${action}: ${error.response ? error.response.data : error.message}`);
            throw error;
        }
    }

     async checkForRefresh() {
        console.log('Checking for refresh...');
        const currentPlayback = await this.getCurrentPlayback();

        if (currentPlayback && currentPlayback.item) {
            const songData = {
                album: currentPlayback.item.album || 'Unknown Album',
                artist: currentPlayback.item.artist || 'Unknown Artist',
                track_name: currentPlayback.item.title || 'Unknown Track',
                track_duration: currentPlayback.item.duration || 0,
                track_progress: currentPlayback.item.position || 0,
                volume: currentPlayback.volume || this.currentVolume || 50, // Default volume to 50 if not available
                device: 'Sonos',
                device_id: 'SONOS-DEVICE-ID', // Adjust this with actual device ID if available
                is_playing: currentPlayback.is_playing || false,
            };

            DK.getInstance().sendDataToClient({ app: 'client', type: 'song', payload: songData });
        } else {
            DK.getInstance().sendLog('Unable to refresh... no song currently playing!');
        }
    }

    // Mock function to retrieve current playback (replace with actual SOAP/UPnP call)
    async getCurrentPlayback() {
        try {
            const response = await this.getPositionInfo();
            if (response && response.TrackMetaData) {
                const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
                const parsedMetaData = await parser.parseStringPromise(response.TrackMetaData);
                const item = parsedMetaData['DIDL-Lite'] && parsedMetaData['DIDL-Lite']['item'];
                
                return {
                    item: {
                        album: item['upnp:album'] || 'Unknown Album',
                        artist: item['dc:creator'] || 'Unknown Artist',
                        title: item['dc:title'] || 'Unknown Track',
                        duration: response.TrackDuration || 0,
                        position: response.RelTime || 0
                    },
                    is_playing: response.TransportState === 'PLAYING',
                    volume: await this.getCurrentVolume(),
                };
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error getting playback information:', error);
            return null;
        }
    }


    async getTrackInfo() {
        const action = "GetPositionInfo";
        const params = { InstanceID: 0 };

        try {
            const result = await this.execute(action, params);

            this.sendLog("Parsing track info XML data...");
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const parsedResult = await parser.parseStringPromise(result);

            const trackData = parsedResult['s:Envelope']['s:Body']['u:GetPositionInfoResponse'];
            const trackMetaData = trackData['TrackMetaData'];

            let trackInfo = 'Unknown Track';
            let album = 'Unknown Album';
            let albumArtURI = null;

            if (trackMetaData && trackMetaData.includes('<DIDL-Lite')) {
                const metaParser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
                const metaResult = await metaParser.parseStringPromise(trackMetaData);

                const item = metaResult['DIDL-Lite'] && metaResult['DIDL-Lite']['item'];
                albumArtURI = item && item['upnp:albumArtURI'] || null;

                if (item && item['r:streamContent']) {
                    const streamContent = item['r:streamContent'];
                    this.sendLog(`Stream Content: ${streamContent}`);

                    const artistMatch = streamContent.match(/ARTIST\s+([^|]+)\|/);
                    const titleMatch = streamContent.match(/TITLE\s+([^|]+)\|/);
                    const albumMatch = streamContent.match(/ALBUM\s+(.*)/);

                    const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
                    const title = titleMatch ? titleMatch[1].trim() : 'Unknown Track';
                    album = albumMatch ? albumMatch[1].trim() : 'Unknown Album';

                    trackInfo = `${artist} - ${title}`;

                    this.sendLog(`Extracted Stream Info: ${trackInfo}, Album - ${album}`);
                } else {
                    const artist = item && item['dc:creator'] || 'Unknown Artist';
                    const title = item && item['dc:title'] || 'Unknown Track';
                    album = item && item['upnp:album'] || 'Unknown Album';
                    trackInfo = `${artist} - ${title}`;
                }

                if (albumArtURI && (albumArtURI.startsWith('http://') || albumArtURI.startsWith('https://'))) {
                   this.sendLog(`Album art URI: ${albumArtURI}`);
                } else if (albumArtURI) {                 
                   albumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
                   this.sendLog(`Album art URI updated with device IP: ${albumArtURI}`);
                }
            } else {
                this.sendLog("Track metadata not found or not in expected format. Skipping update.");
            }

            this.sendLog(`Fetched Track Info: ${trackInfo}, Album - ${album}, AlbumArtURI - ${albumArtURI}`);

            const songData = {
                track_name: trackInfo,
                artist: '',
                album: album,
                thumbnail: albumArtURI ? await this.getImageData(albumArtURI) : null,
            };

            DK.getInstance().sendDataToClient({ app: 'client', type: 'song', payload: songData });
            DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'song', payload: songData });
        } catch (error) {
            this.sendError('Error getting track info: ' + error.message);
            DK.getInstance().sendDataToClient({
                type: 'song',
                payload: {
                    track_name: 'Unknown Track',
                    artist: 'Unknown Artist',
                    album: 'Unknown Album',
                    thumbnail: null
                }
            });
        }
    }

    // Fetch track position info using SOAP
    async getPositionInfo() {
        const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/AVTransport/Control`;
        const soapAction = `"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"`;
        const request = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body>
                    <u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                        <InstanceID>0</InstanceID>
                    </u:GetPositionInfo>
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
            const positionInfo = result['s:Envelope']['s:Body']['u:GetPositionInfoResponse'];

            return positionInfo;
        } catch (error) {
            console.error('Error fetching position info:', error);
            return null;
        }
    }



     // Fetch and send favorites to the frontend
     async getFavorites() {
        if (!this.deviceIP) {
            throw new Error('Sonos device IP is not set.');
        }

        const url = `http://${this.deviceIP}:${this.port}/MediaServer/ContentDirectory/Control`;
        const soapAction = `"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"`;
        const request = `<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
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

            this.sendLog(`SOAP Response: ${response.data}`);

            // Parse the SOAP response to extract favorites
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const parsedResult = await parser.parseStringPromise(response.data);
            const favorites = parsedResult['s:Envelope']['s:Body']['u:BrowseResponse']['Result'];

            this.sendLog(`Parsed Favorites XML: ${JSON.stringify(favorites)}`);

            const metaParser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const metaResult = await metaParser.parseStringPromise(favorites);
            const items = metaResult['DIDL-Lite'] && metaResult['DIDL-Lite']['item'];

            if (!items) {
                throw new Error('No items found in favorites.');
            }

            const favoritesList = await Promise.all(items.map(async (item: any) => {
                let albumArtURI = item['upnp:albumArtURI'];
            
                // Ensure the album art URI is properly formatted
                if (albumArtURI && !albumArtURI.startsWith('http://') && !albumArtURI.startsWith('https://')) {
                    albumArtURI = `http://${this.deviceIP}:${this.port}${albumArtURI}`;
                }
            
                // Fetch and encode the album art as base64
                const encodedAlbumArtURI = albumArtURI ? await getImageData(albumArtURI) : null;
            
                return {
                    title: item['dc:title'] || 'Unknown Title',
                    albumArt: encodedAlbumArtURI || 'default-image.jpg',  // Use base64 encoded album art or default
                    uri: item['res'] || null  // Ensure the URI is correctly sent
                };
            }));

            // Send the favorites data to the frontend
            DK.getInstance().sendDataToClient({ app: 'client', type: 'favorites', payload: favoritesList });
            DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'favorites', payload: favoritesList });
                               } catch (error) {
            this.sendError(`Error fetching favorites: ${error.response ? error.response.data : error.message}`);
        }
    }

    // Helper function to escape XML special characters
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
    
    // Helper function to fetch the image data and convert it to base64
    async getImageData(imageUrl: string) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            const mimeType = response.headers['content-type'];
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            this.sendError('Error fetching image: ' + error.message);
            return null;
        }
    }
    

    extractFavorites(data: any) {
        const items = data['DIDL-Lite']['item'] || [];
        return items.map((item: any) => ({
            title: item['dc:title'],
            albumArtURI: item['upnp:albumArtURI'] || 'default-image.jpg',
            uri: item['res'],
        }));
    }

    async getZoneGroupState() {
        if (!this.deviceIP) {
            throw new Error('Sonos device IP is not set.');
        }

        const url = `http://${this.deviceIP}:${this.port}/ZoneGroupTopology/Control`;
        const soapAction = `"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"`;
        const request = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body>
                    <u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1"></u:GetZoneGroupState>
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

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.data, "text/xml");
            const zoneGroupState = xmlDoc.querySelector("ZoneGroupState").textContent;

            return new DOMParser().parseFromString(zoneGroupState, 'text/xml');
        } catch (error) {
            this.sendError('Error getting Zone Group State: ' + error.message);
            throw error;
        }
    }

    async playFavorite(uri: string) {
        try {
            // Clear the queue first
            await this.clearQueue();
    
            // Add the URI to the queue
            const addToQueueAction = "AddURIToQueue";
            const params = {
                InstanceID: 0,
                EnqueuedURI: uri,
                EnqueuedURIMetaData: this.generateMetaData(uri), // Ensure metadata is generated
                DesiredFirstTrackNumberEnqueued: 0,
                EnqueueAsNext: 1
            };
    
            await this.execute(addToQueueAction, params);
    
            // Play the track
            await this.play();
    
            this.sendLog(`Playing favorite with URI: ${uri}`);
        } catch (error) {
            this.sendError('Error playing favorite: ' + error.message);
        }
    }
    

    generateMetaData(uri: string, title: string) {
        if (uri.startsWith('x-sonosapi-hls:') || uri.startsWith('x-sonosapi-stream:')) {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.item.audioItem.audioBroadcast</upnp:class>
                        <res protocolInfo="x-sonosapi-hls:*:*:*">${uri}</res>
                        <desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON</desc>
                    </item>
                </DIDL-Lite>`;
        } else if (uri.startsWith('x-sonosapi-radio:')) {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.item.audioItem.audioBroadcast</upnp:class>
                        <res protocolInfo="x-sonosapi-radio:*:*:*">${uri}</res>
                    </item>
                </DIDL-Lite>`;
        } else if (uri.startsWith('x-rincon-cpcontainer:')) {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.container.playlistContainer</upnp:class>
                        <res protocolInfo="x-rincon-cpcontainer:*:*:*">${uri}</res>
                    </item>
                </DIDL-Lite>`;
        } else if (uri.startsWith('x-rincon-playlist:')) {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.container.playlistContainer</upnp:class>
                        <res protocolInfo="x-rincon-playlist:*:*:*">${uri}</res>
                    </item>
                </DIDL-Lite>`;
        } else if (uri.startsWith('x-rincon-mp3radio:')) {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.item.audioItem.audioBroadcast</upnp:class>
                        <res protocolInfo="x-rincon-mp3radio:*:audio/x-rincon-mp3radio:*">${uri}</res>
                    </item>
                </DIDL-Lite>`;
        } else {
            return `
                <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                           xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">
                    <item id="${uri}" parentID="0" restricted="true">
                        <dc:title>${title}</dc:title>
                        <upnp:class>object.item.audioItem.musicTrack</upnp:class>
                        <res protocolInfo="http-get:*:*:*">${uri}</res>
                    </item>
                </DIDL-Lite>`;
        }
    }
    async setVolumeChange(change) {
      try {
          const currentVolume = await this.getCurrentVolume();
          const newVolume = Math.min(100, Math.max(0, currentVolume + change));
          await this.setVolume(newVolume);
          DK.getInstance().sendDataToClient({ app: 'sonos-webapp', type: 'volume', payload: newVolume });
      } catch (error) {
          console.error('Error changing volume:', error);
      }
  }
  
  async volume(newVol: number) {
    const url = `$http://${this.deviceIP}:${this.port}/MediaRenderer/RenderingControl/Control/${newVol}`
    return this.makeRequest('put', url)
  }
  async getCurrentVolume(): Promise<number> {
      if (!this.deviceIP) throw new Error('Sonos device IP is not set.');

      const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/RenderingControl/Control`;
      const soapAction = `"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"`;
      const request = `<?xml version="1.0" encoding="utf-8"?>
          <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
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
      } catch (error) {
          console.error('Error getting current volume:', error);
          throw error;
      }
  }

  async setVolume(volume: number) {
    const url = `http://${this.deviceIP}:${this.port}/MediaRenderer/RenderingControl/Control`;
        const soapAction = `"urn:schemas-upnp-org:service:RenderingControl:1#SetVolume"`;
        const request = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
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
        } catch (error) {
            this.sendError(`Error setting volume: ${error.response ? error.response.data : error.message}`);
            throw error;
        }
    }



    async getTrackPosition() {
        const action = "GetPositionInfo";
        const params = { InstanceID: 0 };

        try {
            const result = await this.execute(action, params);
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const parsedResult = await parser.parseStringPromise(result);

            const trackData = parsedResult['s:Envelope']['s:Body']['u:GetPositionInfoResponse'];
            const trackDuration = trackData['TrackDuration'];
            const relTime = trackData['RelTime'];

            const duration = this.parseTime(trackDuration);
            const position = this.parseTime(relTime);

            if (duration > 0 && position >= 0) {
                DK.getInstance().sendDataToClient({
                    app: 'sonos-webapp',
                    type: 'trackPosition',
                    payload: { position, duration }
                });
            }
        } catch (error) {
            this.sendError('Error getting track position: ' + error.message);
        }
    }

    parseTime(timeStr: string) {
        const parts = timeStr.split(':').map(Number);
        return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }

    startTrackPositionUpdates() {
        if (this.trackPositionInterval) {
            clearInterval(this.trackPositionInterval);
        }
        this.trackPositionInterval = setInterval(() => this.getTrackPosition(), 1000);
    }

    stopTrackPositionUpdates() {
        if (this.trackPositionInterval) {
            clearInterval(this.trackPositionInterval);
            this.trackPositionInterval = null;
        }
    }

    async play() {
        await this.execute('Play', { Speed: 1 });
        this.startPollingTrackInfo();
        this.startTrackPositionUpdates();
    }

    async pause() {
        await this.execute('Pause');
        this.stopPollingTrackInfo();
        this.stopTrackPositionUpdates();
    }

    async next() {
        await this.execute('Next');
        await this.getTrackInfo();
    }

    async previous() {
        await this.execute('Previous');
        await this.getTrackInfo();
    }
}

export default SonosHandler;
