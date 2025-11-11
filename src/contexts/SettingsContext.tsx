// src/contexts/SettingsContext.tsx
import React, { createContext, useEffect, useState } from 'react';
import { DeskThing } from '@deskthing/client';

export interface SettingsContextType {
  settings: Record<string, any>;
  isReady: boolean;
}

export const SettingsContext = createContext<SettingsContextType>({
  settings: {},
  isReady: false,
});

const valueOf = (entry: any, fallback?: any) => {
  if (entry === undefined || entry === null) return fallback;
  if (typeof entry === 'object' && 'value' in entry) return entry.value;
  return entry;
};

const toBoolean = (value: any, fallback: boolean) => {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
};

const toNumber = (value: any, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

// Normalize to your exact keys and types
const normalizeSettings = (s: Record<string, any>) => {
  const rawDark = valueOf(s?.dark_mode, undefined);
  return {
    sonos_ip: valueOf(s?.sonos_ip, '192.168.4.109'),
    dark_mode: toBoolean(rawDark, true),
    volume_scroll_delta: toNumber(valueOf(s?.volume_scroll_delta, 1), 1),
    volume_bar_timeout: toNumber(valueOf(s?.volume_bar_timeout, 5000), 5000),
    marquee_interval_ms: toNumber(valueOf(s?.marquee_interval_ms, 30000), 30000),
  };
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initial fetch
    DeskThing.getSettings()
      .then((s) => {
        setSettings(normalizeSettings(s || {}));
        setIsReady(true);
      })
      .catch(() => setIsReady(true));

    // Listen for BOTH events — some servers emit 'settings', others 'settingsUpdated'
    const offUpdated = DeskThing.on('settingsUpdated', (data) => {
      setSettings(normalizeSettings((data as any)?.payload || {}));
    });
    const offSettings = DeskThing.on('settings', (data) => {
      setSettings(normalizeSettings((data as any)?.payload || {}));
    });

    return () => {
      offUpdated?.();
      offSettings?.();
    };
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isReady }}>
      {children}
    </SettingsContext.Provider>
  );
};
