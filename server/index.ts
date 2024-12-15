// src/index.ts

import SonosHandler from './sonos';
import { DeskThing, DataInterface, SettingsType } from 'deskthing-server';
export { DeskThing };

let sonos: SonosHandler | null;

const start = async () => {
  if (!sonos) {
    sonos = new SonosHandler();
  }

  DeskThing.on('get', handleGet);
  DeskThing.on('set', handleSet);

  const data = await DeskThing.getData();
  if (data && data.Sonos_IP) {
    handleNewIp(data.Sonos_IP as string);
  }

  if (!data?.settings?.Sonos_IP) {
    DeskThing.addSettings({
      Sonos_IP: {
        value: '',
        type: 'string',
        label: 'Sonos Device IP',
        description: 'Please enter the IP address of your Sonos device.',
      },
    })
  }

};

const handleSettingsChange = async (settings: { [key: string]: SettingsType }) => {
  if (settings.Sonos_IP && settings.Sonos_IP.type == 'string') {
    handleNewIp(settings.Sonos_IP.value);
  }
};

// Ensure settings stay updated
DeskThing.on('settings', handleSettingsChange)


const handleNewIp = async (ip: string) => {
  if (!sonos) {
    sonos = new SonosHandler();
  } 
  if (ip) {
    sonos.deviceIP = ip;
    sonos.getTrackInfo();
    sonos.getFavorites();
    sonos.getZoneGroupState();
    sonos.startPollingTrackInfo();
  } else {
    promptForIP();
  }
}

const promptForIP = () => {
  DeskThing.getUserInput(
    {
      Sonos_IP: {
        value: '',
        label: 'Sonos Device IP',
        instructions: 'Please enter the IP address of your Sonos device.',
      },
    },
    (data: any) => {
      if (data.payload.Sonos_IP) {
        DeskThing.saveData({ Sonos_IP: data.payload.Sonos_IP });
        handleNewIp(data.payload.Sonos_IP);
      } else {
        DeskThing.sendError('No IP address provided!');
      }
    }
  );
};

const handleGet = async (data: any) => {

  if (!sonos) {
    sonos = new SonosHandler();
  }

  switch (data.request) {
    case 'playMode':
      const playMode = await sonos.getCurrentPlayMode();
      DeskThing.sendDataToClient({
        app: 'sonos-webapp',
        type: 'playMode',
        payload: { playMode },
      });
      break;
    case 'song':
      await sonos.getTrackInfo();
      break;
    case 'refresh':
      await sonos.checkForRefresh();
      break;
    case 'favorites':
      await sonos.getFavorites();
      break;
      case 'volume':
        if (data.payload && data.payload.speakerUUIDs) {
          const speakerUUIDs = data.payload.speakerUUIDs;
          try {
            const volume = await sonos.getCurrentVolume(speakerUUIDs);
            // Send the volume back to the frontend
            DeskThing.sendDataToClient({
              app: 'sonos-webapp',
              type: 'currentVolume',
              payload: { volume, uuid: speakerUUIDs[0] },
            });
          } catch (error: any) {
            DeskThing.sendError(`Error fetching volume: ${error.message}`);
          }
        } else {
          DeskThing.sendError('No speaker UUIDs provided for volume request');
        }
        break;
      case 'selectedVolumeSpeakers':
      DeskThing.sendDataToClient({
        app: 'sonos-webapp',
        type: 'selectedVolumeSpeakers',
        payload: { uuids: sonos.selectedVolumeSpeakers },
      });
      break;
    case 'selectedPlaybackSpeakers':
      DeskThing.sendDataToClient({
        app: 'sonos-webapp',
        type: 'selectedPlaybackSpeakers',
        payload: { uuids: sonos.selectedPlaybackSpeakers },
      });
      break;
    case 'speakersList':
      const speakersArray = Object.entries(sonos.speakersList).map(([uuid, info]) => ({
        uuid,
        ...info,
      }));
      DeskThing.sendDataToClient({
        app: 'sonos-webapp',
        type: 'speakersList',
        payload: speakersArray,
      });
      break;

    case 'zoneGroupState':
      await sonos.getZoneGroupState();
      break;
      case 'selectedSpeakers':
        DeskThing.sendDataToClient({
          app: 'sonos-webapp',
          type: 'selectedSpeakers',
          payload: { uuids: sonos.selectedSpeakerUUIDs },
        });
        break;
    default:
      DeskThing.sendError(`Unknown request: ${data.request}`);
      break;
  }
};

const handleSet = async (data: any) => {
  if (!sonos) {
    sonos = new SonosHandler();
  }

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
    case 'addSpeakerToGroup':
      if (data.payload && data.payload.coordinatorIP && data.payload.speakerIP) {
        await sonos.addSpeakerToGroup(data.payload.speakerIP, data.payload.coordinatorIP);
      } else {
        DeskThing.sendError('Coordinator IP or speaker IP not provided for addSpeakerToGroup');
      }
      break;
    case 'leaveGroup':
      if (data.payload && data.payload.speakerIP) {
        await sonos.leaveGroup(data.payload.speakerIP);
      } else {
        DeskThing.sendError('Speaker IP not provided for leaveGroup');
      }
      break;
    case 'playFavorite':
      if (data.payload && data.payload.uri) {
        const speakerUUIDs = data.payload.speakerUUIDs || sonos.selectedSpeakerUUIDs;
        await sonos.playFavoriteOnSpeakers(data.payload.uri, speakerUUIDs);
      } else {
        DeskThing.sendError('No URI provided for playFavorite');
      }
      break;
    case 'volume':  // This handles getting the current volume when the app starts
      await sonos.setVolume(data.payload);  // Assuming you have a `setVolume` function
      console.log('Set current volume:', data.payload);
      DeskThing.send({
          type: 'currentVolume',
          payload: { volume: data.payload}
      });
      break;
      case 'volumeChange':
        console.log('Received volumeChange request:', data.payload);
        if (data.payload && data.payload.volume !== undefined) {
          const newVolume = data.payload.volume;
          const speakerUUIDs = data.payload.speakerUUIDs || sonos.selectedVolumeSpeakers;
          await sonos.setVolume(newVolume, speakerUUIDs);
        } else {
          DeskThing.sendError('No volume provided for volumeChange');
        }
        break;
        case 'shuffle':
        await sonos.shuffle(data.payload);
        break;
      case 'repeat':
     await sonos.repeat(data.payload);
    break;
          case 'selectedVolumeSpeakers':
        DeskThing.sendDataToClient({
          app: 'sonos-webapp',
          type: 'selectedVolumeSpeakers',
          payload: { uuids: sonos.selectedVolumeSpeakers },
        });
        break;
    case 'selectPlaybackSpeakers':
      if (data.payload && data.payload.uuids) {
        await sonos.selectPlaybackSpeakers(data.payload.uuids);
      } else {
        DeskThing.sendError('No UUIDs provided for selectPlaybackSpeakers');
      }
      break;
    case 'selectSpeakers':
      if (data.payload && data.payload.uuids) {
        await sonos.selectSpeakers(data.payload.uuids);
      } else {
        DeskThing.sendError('No UUIDs provided for selectSpeakers');
      }
      break;
    default:
      DeskThing.sendError(`Unknown request: ${data.request}`);
      break;
  }
};

DeskThing.on('start', start);

const stop = async () => {
  if (sonos) {
    sonos = null;
  }
}

DeskThing.on('stop', stop)