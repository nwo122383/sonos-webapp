// server/sonos/speakers.ts

import { sendLog, sendError } from './logging';
import { DeskThing } from '@deskthing/server';

export class SpeakerManager {
  speakersList: { [uuid: string]: { ip: string; zoneName: string } } = {};
  selectedSpeakerUUIDs: string[] = [];
  selectedVolumeSpeakers: string[] = [];
  selectedPlaybackSpeakers: string[] = [];

  async getSpeakerIPByUUID(uuid: string): Promise<string | null> {
    if (this.speakersList?.[uuid]) return this.speakersList[uuid].ip;

    sendLog(`Speaker IP for UUID ${uuid} not found in cache.`);
    return null;
  }

  async selectSpeakers(uuids: string[]) {
    this.selectedSpeakerUUIDs = uuids;
    DeskThing.send({ app: 'sonos-webapp', type: 'selectedSpeakers', payload: { uuids } });
  }

  async selectVolumeSpeakers(uuids: string[]) {
    this.selectedVolumeSpeakers = uuids;
    sendLog(`Selected volume speakers: ${uuids.join(', ')}`);
    DeskThing.send({ app: 'sonos-webapp', type: 'selectedVolumeSpeakers', payload: { uuids } });
  }

  async selectPlaybackSpeakers(uuids: string[]) {
    this.selectedPlaybackSpeakers = uuids;
    sendLog(`Selected playback speakers: ${uuids.join(', ')}`);
    DeskThing.send({ app: 'sonos-webapp', type: 'selectedPlaybackSpeakers', payload: { uuids } });
  }
}
