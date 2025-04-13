import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SettingsProvider } from './providers/SettingsProvider';


const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement);
root.render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
);
