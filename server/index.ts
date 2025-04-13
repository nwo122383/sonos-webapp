// server/index.ts

import { DESKTHING_EVENTS } from '@deskthing/types';
import { DeskThing } from '@deskthing/server';
import { initialize } from './initializer';

const start = async () => {
  await initialize();
  console.log('[Sonos] Backend initialized!');
  DeskThing.sendLog('Sonos app started!');
};

DeskThing.on(DESKTHING_EVENTS.START, start);
