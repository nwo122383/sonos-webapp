import React from 'react';
import { DeskThing } from '@deskthing/client';

const PlaybackControl: React.FC = () => {
  const sendControl = (command: 'play' | 'pause' | 'next' | 'previous') => {
    DeskThing.send({
      type: 'set',
      request: command,
      payload: {},
    });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', marginTop: '1rem' }}>
      <button onClick={() => sendControl('previous')}>⏮️</button>
      <button onClick={() => sendControl('play')}>▶️</button>
      <button onClick={() => sendControl('pause')}>⏸️</button>
      <button onClick={() => sendControl('next')}>⏭️</button>
    </div>
  );
};

export default PlaybackControl;
