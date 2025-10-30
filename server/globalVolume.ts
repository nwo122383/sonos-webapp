// server/globalVolume.ts
// Minimal, safe listener that makes global volume work anywhere.
// No new deps, no changes to your other files.

import { DeskThing } from './initializer';
import sonos from './sonos';
import { SocketData } from '@deskthing/types';

let bound = false;

export function setupGlobalVolume() {
  if (bound) return;
  bound = true;

  console.log('[Sonos] Global volume listener active.');

  DeskThing.on('set', async (msg: SocketData) => {
    const { request, payload } = msg;

    // Wheel or +/- should call this (from anywhere).
    if (request === 'adjustVolume') {
      const delta = typeof (payload as any)?.delta === 'number' ? (payload as any).delta : 0;
      if (!Number.isFinite(delta) || delta === 0) return;
      try {
        await sonos.adjustVolume(delta);
      } catch (e) {
        console.error('[GlobalVolume] adjustVolume failed:', e);
      }
      return;
    }

    // Optional: absolute global set (keeps your existing setVolume intact)
    if (request === 'setGlobalVolume') {
      const volume = Number((payload as any)?.volume);
      if (!Number.isFinite(volume)) return;
      try {
        // Applies to sonos.selectedVolumeSpeakers if set; falls back internally per your handler.
        await sonos.setVolume(volume);
      } catch (e) {
        console.error('[GlobalVolume] setGlobalVolume failed:', e);
      }
      return;
    }
  });
}
