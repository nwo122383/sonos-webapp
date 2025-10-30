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

// Normalize to your exact keys and types
const normalizeSettings = (s: Record<string, any>) => ({
  sonos_ip: s?.sonos_ip || '192.168.4.109',
  dark_mode: s?.dark_mode === true || s?.dark_mode === 'true',
  volume_scroll_delta: Number(s?.volume_scroll_delta ?? 1),
  volume_bar_timeout: Number(s?.volume_bar_timeout ?? 5000),
});

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
