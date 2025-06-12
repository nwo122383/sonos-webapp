// server/setupGetters.ts

import { DeskThing } from './initializer';
import sonos from './sonos';
import { SocketData } from '@deskthing/types';

export const setupGetters = () => {
  console.log('[Sonos] Registering GET listeners.');

  DeskThing.on('get', async (socketData: SocketData) => {
    console.log(`[Sonos] Received GET: ${JSON.stringify(socketData)}`);

    const { request, payload } = socketData;

    switch (request) {
      case 'favorites':
        await sonos.getFavorites();
        break;

      case 'zoneGroupState':
        await sonos.getZoneGroupState();
        break;
        
        case 'volume':
       if (payload?.speakerUUIDs) {
      try {
      const volume = await sonos.getCurrentVolume(payload.speakerUUIDs);
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'currentVolume',
        payload: {
          volume,
          uuid: payload.speakerUUIDs[0],
        },
      });
    } catch (err: any) {
      console.error(`Error fetching volume: ${err.message}`);
    }
  } else {
    console.error('No speaker UUIDs provided for volume request');
  }
  break;

  case 'currentVolume': {
    const uuids = data.payload?.speakerUUIDs || sonos.selectedVolumeSpeakers;
    if (!uuids || uuids.length === 0) {
      console.error('No speaker UUIDs provided for volume request');
      return;
    }
  
    try {
      const volume = await sonos.getCurrentVolume(uuids);
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'currentVolume',
        payload: { volume, uuid: uuids[0] },
      });
    } catch (error: any) {
      console.error(`Error fetching volume: ${error.message}`);
    }
    break;
  }
  

      case 'selectedVolumeSpeakers':
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'selectedVolumeSpeakers',
          payload: { uuids: sonos.selectedVolumeSpeakers },
        });
        break;

      case 'selectedPlaybackSpeakers':
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'selectedPlaybackSpeakers',
          payload: { uuids: sonos.selectedPlaybackSpeakers },
        });
        break;

      case 'selectedSpeakers':
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'selectedSpeakers',
          payload: { uuids: sonos.selectedSpeakerUUIDs },
        });
        break;

      case 'speakersList':
        const speakerListArray = Object.entries(sonos.speakersList).map(([uuid, info]) => ({
          uuid,
          ...info,
        }));
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'speakersList',
          payload: speakerListArray,
        });
        break;
    }
  });
};
