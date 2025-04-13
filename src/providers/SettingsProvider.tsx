import React, { useEffect, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import { SettingsContext } from '../contexts/SettingsContext';

interface SettingsProviderProps {
  children: React.ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialSettings = (window as any).settings ?? {};
    setSettings(initialSettings);
    setIsReady(true);

    const unsub = DeskThing.on('settings', (data) => {
      if (data?.payload) {
        setSettings(data.payload);
        setIsReady(true);
      }
    });

    return () => unsub();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isReady }}>
      {children}
    </SettingsContext.Provider>
  );
};
