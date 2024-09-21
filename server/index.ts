import SonosHandler from './sonos';
import { DeskThing as DK } from 'deskthing-server';
const DeskThing = DK.getInstance();
export { DeskThing };

let sonos: SonosHandler;

const start = async () => {
    sonos = new SonosHandler();
    DeskThing.sendDataToClient('get', 'data');

    DeskThing.on('get', handleGet);
    DeskThing.on('set', handleSet);
    DeskThing.on('data', (data: any) => {
        if (data.Sonos_IP) {
            sonos.deviceIP = data.Sonos_IP;
            sonos.getTrackInfo();
            sonos.getFavorites();
        } else {
            promptForIP();
        }
    });

    // Fetch initial data
    const data = await DeskThing.getData();
    if (data.Sonos_IP) {
        sonos.deviceIP = data.Sonos_IP;
        sonos.getTrackInfo();
        sonos.getFavorites();
    } else {
        promptForIP();
    }
};

const promptForIP = () => {
    DeskThing.getUserInput({
        Sonos_IP: {
            value: '',
            label: 'Sonos Device IP',
            instructions: 'Please enter the IP address of your Sonos device.',
        },
    }, (data: any) => {
        if (data.payload.Sonos_IP) {
            DeskThing.saveData({ Sonos_IP: data.payload.Sonos_IP });
            sonos.deviceIP = data.payload.Sonos_IP;
            sonos.getTrackInfo();
            sonos.getFavorites();
        } else {
            DeskThing.sendError('No IP address provided!');
        }
    });
};

const handleGet = async (data: any) => {
    switch (data.request) {
        case 'song':
            await sonos.getTrackInfo();
            break;
        case 'refresh':
            await sonos.checkForRefresh();
            break;
        case 'favorites':
            await sonos.getFavorites();
            break;
        default:
            DeskThing.sendError(`Unknown request: ${data.request}`);
            break;
    }
};

const handleSet = async (data: any) => {
    switch (data.request) {
        case 'next':
            await sonos.next();
            break;
        case 'previous':
            await sonos.previous();
            break;
        case 'play':
            await sonos.play();
            break;
        case 'pause':
            await sonos.pause();
            break;
        case 'getTrackInfo':
            await sonos.getTrackInfo();
            break;
        case 'stopPolling':
            sonos.stopPollingTrackInfo();
            break;
            case 'playFavorite':
              if (data.payload && data.payload.uri) {
                  console.log('Playing favorite with URI:', data.payload.uri);
  
                  // Call playFavorite with the URI; metaData will be fetched by SonosHandler
                  await sonos.playFavorite(data.payload.uri);
  
                  // Optionally start playing if the "play" setting is enabled
                  if (data.payload.play === '1') {
                      await sonos.play();
                  }
              } else {
                  DeskThing.sendError('No URI provided for playFavorite');
              }
              break;

        case 'playUri':
            if (data.payload && data.payload.uri) {
                console.log('Playing URI:', data.payload.uri);

                // Call playUri, which will handle parsing the URI for metadata
                await sonos.playUri(data.payload.uri);

                if (data.payload.play === '1') {
                    await sonos.play();
                }
            } else {
                DeskThing.sendError('No URI provided for playUri');
            }
            break;
        case 'volumeChange':
            const newVolume = data.payload.volume;
            await sonos.setVolume(newVolume);
            console.log('Set volume to:', newVolume);
            DeskThing.sendMessageToClients({
                app: 'sonos-webapp',
                type: 'volumeChange',
                payload: { volume: newVolume }
            });
            break;

        case 'volume':
            await sonos.setVolume(data.payload);
            console.log('Set current volume:', data.payload);
            DeskThing.sendMessageToClients({
                app: 'sonos-webapp',
                type: 'currentVolume',
                payload: { volume: data.payload }
            });
            break;
        default:
            DeskThing.sendError(`Unknown action: ${data.request}`);
            break;
    }
};

DeskThing.on('start', start);
