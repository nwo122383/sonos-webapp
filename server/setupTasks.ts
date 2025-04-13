// server/setupTasks.ts
import { DeskThing } from './initializer';
import sonos from './sonos';

// This runs every 10 seconds
export const setupTasks = () => {
  setInterval(async () => {
    try {
      await sonos.getTrackInfo();
    } catch (err) {
      DeskThing.sendError(`[Polling] Failed to get now playing: ${err}`);
    }
  }, 10000);
};
