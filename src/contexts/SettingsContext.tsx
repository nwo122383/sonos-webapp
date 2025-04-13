import { createContext } from 'react';
import { AppSettings } from '@deskthing/types';

export interface SettingsContextType {
  settings: Record<string, any>;
  isReady: boolean;
}

export const SettingsContext = createContext<SettingsContextType>({
  settings: {},
  isReady: false,
});
