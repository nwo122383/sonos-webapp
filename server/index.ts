// server/index.ts

import { DESKTHING_EVENTS } from '@deskthing/types';
import { DeskThing } from '@deskthing/server';
import { initialize } from './initializer';

const start = async () => {
  await initialize();
  console.log('[Sonos] Backend initialized!');
  console.log('Sonos app started!');
};

DeskThing.on(DESKTHING_EVENTS.START, start);

// Start immediately when this script is executed directly. The START event may
// not fire if the backend is launched standalone, so this ensures all listeners
// are registered and ready for GET requests.
start();
