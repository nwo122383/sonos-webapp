// server/sonos/registerPlayLatestFromFavorite.ts

import { playLatestFromFavoriteAction } from '../playLatestFromFavorite';

type Sonos = any;
type DeskThingLike = {
  on: (evt: string, cb: (msg: any) => void) => void;
  send: (msg: any) => void;
};

export function registerPlayLatestFromFavorite(DeskThing: DeskThingLike, sonos: Sonos) {
  // IMPORTANT: do not add another .on('set') if your code already has one central router.
  // If you already centralize 'set' routing, call playLatestFromFavoriteAction *from that switch* instead.
  // If you *don't* have a central router (or you want to isolate this), this will work as its own listener.

  DeskThing.on('set', async (socketData: any) => {
    try {
      if (!socketData || socketData.type !== 'set') return;
      const request = socketData.request;
      if (request !== 'playLatestFromFavorite') return;

      const body = socketData.payload ?? {};
      console.log('[Sonos] Received SET: playLatestFromFavorite');
      console.log('[playLatestFromFavorite] incoming body:', {
        objectId: body?.objectId,
        speakerUUIDs: body?.speakerUUIDs,
        speakerIP: body?.speakerIP,
        hasMeta: !!body?.metaData,
      });

      await playLatestFromFavoriteAction({ sonos, DeskThing }, body);
    } catch (err) {
      console.error('[registerPlayLatestFromFavorite] error:', err);
      DeskThing.send({
        app: 'sonos-webapp',
        type: 'error',
        request: 'playLatestFromFavorite',
        payload: { message: 'Unhandled exception', details: (err as any)?.message ?? String(err) },
      });
    }
  });
}
