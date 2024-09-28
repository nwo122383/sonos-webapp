// src/index.ts

import SonosHandler from './sonos';
import { DeskThing as DK } from 'deskthing-server';
const DeskThing = DK.getInstance();
export { DeskThing };

let sonos: SonosHandler;

const start = async () => {
  sonos = new SonosHandler();

  DeskThing.on('get', handleGet);
  DeskThing.on('set', handleSet);

  // Fetch initial data
  const data = await DeskThing.getData();
  if (data.Sonos_IP) {
    sonos.deviceIP = data.Sonos_IP;
    await sonos.getTrackInfo();
    await sonos.getFavorites();
    await sonos.getZoneGroupState();
  } else {
    promptForIP();
  }
};

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
        sonos.deviceIP = data.payload.Sonos_IP;
        sonos.getTrackInfo();
        sonos.getFavorites();
        sonos.getZoneGroupState();
      } else {
        DeskThing.sendError('No IP address provided!');
      }
    }
  );
};

const handleGet = async (data: any) => {
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
      try {
        const currentVolume = await sonos.getCurrentVolume();
        DeskThing.sendDataToClient({
          app: 'sonos-webapp',
          type: 'currentVolume',
          payload: { volume: currentVolume },
        });
        console.log('Fetched current volume:', currentVolume);
      } catch (error) {
        DeskThing.sendError(`Error fetching volume: ${error.message}`);
      }
      break;
    case 'zoneGroupState':
      await sonos.getZoneGroupState();
      break;
    case 'selectedSpeaker':
      DeskThing.sendDataToClient({
        app: 'sonos-webapp',
        type: 'selectedSpeaker',
        payload: { uuid: sonos.selectedSpeakerUUID },
      });
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
        await sonos.playFavorite(data.payload.uri);
      } else {
        DeskThing.sendError('No URI provided for playFavorite');
      }
      break;
    case 'volumeChange':
      if (data.payload && data.payload.volume !== undefined) {
        const newVolume = data.payload.volume;
        await sonos.setVolume(newVolume);
        DeskThing.sendDataToClient({
          app: 'sonos-webapp',
          type: 'volumeChange',
          payload: { volume: newVolume },
        });
      } else {
        DeskThing.sendError('No volume provided for volumeChange');
      }
      break;
    case 'shuffle':
      await sonos.shuffle(data.payload.state);
      break;
    case 'repeat':
      await sonos.repeat(data.payload.state);
      break;
    case 'selectSpeaker':
      if (data.payload && data.payload.uuid) {
        await sonos.selectSpeaker(data.payload.uuid);
      } else {
        DeskThing.sendError('No UUID provided for selectSpeaker');
      }
      break;
    default:
      DeskThing.sendError(`Unknown request: ${data.request}`);
      break;
  }
};

DeskThing.on('start', start);
