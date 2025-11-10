// server/initializer.ts
import './sonos/augmentPlayLatest'; // <-- ensure the method is attached before actions run

import {
  AUDIO_REQUESTS,
  DESKTHING_EVENTS,
  SocketData,
  SongEvent,
  GenericTransitData
} from "@deskthing/types";
import { setupSettings } from './setupSettings';
import { setupActions } from './setupActions';
import { setupGetters } from './setupGetters';
import { setupTasks } from './setupTasks';
import { setupGlobalVolume } from './globalVolume';
import { createDeskThing, DeskThingClass } from '@deskthing/server';




// Create and export DeskThing instance for global use
export const DeskThing: DeskThingClass<GenericTransitData, GenericTransitData> = createDeskThing();

export const initialize = async () => {
  setupSettings();
  setupActions();
  setupGetters();
  setupTasks();
  setupGlobalVolume();
};

// Example event listener (extendable in future)
DeskThing.on(DESKTHING_EVENTS.SOCKET, (data: SocketData) => {
  // Optional logging or debugging hook
  // console.log(`Received raw socket data: ${JSON.stringify(data)}`);
});
