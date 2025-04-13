import React from 'react';
import App from './App';
import { DeskThing } from '@deskthing/client';

DeskThing.register({
  appId: 'sonos-webapp',
  component: App
});
