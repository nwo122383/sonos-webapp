// server/setupSettings.ts

import { DeskThing } from './initializer';
import sonos from './sonos';
import { AppSettings, SETTING_TYPES } from '@deskthing/types';

export const setupSettings = async () => {
  const settings: AppSettings = {
    sonos_ip: {
      id: 'sonos_ip',
      label: 'Sonos IP Address',
      description: 'The IP address of your Sonos speaker or group coordinator.',
      type: SETTING_TYPES.STRING,
      value: '192.168.5.253',
    },
    dark_mode: {
      id: 'dark_mode',
      label: 'Dark Mode',
      description: 'Enable dark mode UI (black background, white text)',
      type: SETTING_TYPES.BOOLEAN,
      value: true,
    },
    volume_scroll_delta: {
      id: 'volume_scroll_delta',
      label: 'Scroll Volume Delta',
      description: 'How much the volume changes when scrolling the wheel.',
      type: SETTING_TYPES.NUMBER,
      value: 1,
    },
    volume_bar_timeout: {
      id: 'volume_bar_timeout',
      label: 'Volume Bar Timeout (ms)',
      description: 'How long the volume bar stays visible after activity.',
      type: SETTING_TYPES.NUMBER,
      value: 5000,
    },
    marquee_interval_ms: {
      id: 'marquee_interval_ms',
      label: 'Marquee Interval (ms)',
      description: 'Delay between scrolling cycles for titles/artist text (0 disables scrolling).',
      type: SETTING_TYPES.NUMBER,
      value: 30000,
    },
  };

  DeskThing.initSettings(settings);
  console.log('[Sonos] Settings registered with DeskThing.');

  const savedSettings = await DeskThing.getSettings();
  console.log(`Settings received: ${JSON.stringify(savedSettings)}`);

  const ip = savedSettings?.sonos_ip?.value;
  if (ip) {
    sonos.deviceIP = ip;
    console.log(`[Sonos] IP set on handler: ${ip}`);
  } else {
    console.warn('[Sonos] No IP found in settings.');
  }
};
