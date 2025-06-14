// server/setupActions.ts

import { DeskThing } from './initializer';
import sonos from './sonos';
import { SocketData } from '@deskthing/types';

export const setupActions = () => {
  console.log('[Sonos] Registering DeskThing listeners.');

  
  DeskThing.on('set', async (socketData: SocketData) => {
    console.log(`[Sonos] Received SET: ${JSON.stringify(socketData)}`);
    

    const { request, payload } = socketData;

    switch (request) {
      case 'selectVolumeSpeakers':
        if (payload?.uuids) {
          await sonos.selectVolumeSpeakers(payload.uuids);
          DeskThing.send({
            app: 'sonos-webapp',
            type: 'selectedVolumeSpeakers',
            payload: { uuids: sonos.selectedVolumeSpeakers },
          });
        }
        break;
        case 'volumeChange':
  if (typeof payload?.volume === 'number' && Array.isArray(payload?.speakerUUIDs)) {
    for (const uuid of payload.speakerUUIDs) {
      const speakerIP = await sonos.getSpeakerIPByUUID(uuid);
      if (speakerIP) {
        await sonos.setVolume({ volume: payload.volume, uuid });
      }
    }
  } else {
    console.error('Invalid volumeChange payload');
  }
  break;

      case 'selectPlaybackSpeakers':
        if (payload?.uuids) {
          await sonos.selectPlaybackSpeakers(payload.uuids);
          DeskThing.send({
            app: 'sonos-webapp',
            type: 'selectedPlaybackSpeakers',
            payload: { uuids: sonos.selectedPlaybackSpeakers },
          });
          await sonos.getZoneGroupState();
        }
        break;

      case 'selectSpeakers':
        if (payload?.uuids) {
          await sonos.selectSpeakers(payload.uuids);
          DeskThing.send({
            app: 'sonos-webapp',
            type: 'selectedSpeakers',
            payload: { uuids: sonos.selectedSpeakerUUIDs },
          });
        }
        break;

        case 'playFavorite':
          if (payload?.uri) {
            const uuids =
              payload.speakerUUIDs ||
              sonos.selectedPlaybackSpeakers ||
              sonos.selectedSpeakerUUIDs ||
              [];
        
            if (uuids.length > 0) {
              await sonos.playFavoriteOnSpeakers(payload.uri, uuids);
            } else {
              console.warn('[playFavorite] No speakers selected.');
            }
          }
          break;
        

      case 'setVolume':
        if (payload?.uuid && typeof payload.level === 'number') {
          await sonos.setVolume(payload.uuid, payload.level);
        }
        break;

      case 'adjustVolume':
        if (typeof payload?.delta === 'number') {
          await sonos.adjustVolume(payload.delta);
        }
        break;

     case 'browseFavorite':
         if (payload?.objectId && payload?.speakerIP) {
        const results = await sonos.browseFavorite(payload.objectId, payload.speakerIP);
        console.log('[Sonos] Sending browseFavoriteResults:', results);

        DeskThing.send({
          app: 'sonos-webapp',
          type: 'browseFavoriteResults',
          payload: results,
        });
        } else {
        console.warn('[browseFavorite] Missing objectId or speakerIP in payload.');
        }
        break;

      case 'pause':
        if (sonos.deviceIP) {
          await sonos.pause(sonos.deviceIP);
        }
        break;

      case 'play':
        if (sonos.deviceIP) {
          await sonos.play(sonos.deviceIP);
        }
        break;

      case 'next':
      case 'skip':
        if (sonos.deviceIP) {
          await sonos.next(sonos.deviceIP);
        }
        break;

      case 'previous':
        if (sonos.deviceIP) {
          await sonos.previous(sonos.deviceIP);
        }
        break;
    }
  });
};
