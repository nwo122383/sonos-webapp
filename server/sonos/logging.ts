// server/sonos/logging.ts

import { DeskThing } from '@deskthing/server';
import { LOGGING_LEVELS } from '@deskthing/types';

const APP = 'sonos-webapp';

export const sendLog = (msg: string) => {
  DeskThing.log(LOGGING_LEVELS.LOG, msg);
  DeskThing.send({ app: APP, type: 'log', payload: msg });
};

export const sendError = (msg: string) => {
  DeskThing.log(LOGGING_LEVELS.ERROR, msg);
  DeskThing.send({ app: APP, type: 'error', payload: msg });
};
