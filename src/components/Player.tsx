// src/components/Player.tsx

import React, { useEffect, useState } from 'react';
import { DeskThing } from '@deskthing/client';

type SongData = {
  track_name: string;
  artist: string;
  album: string;
  thumbnail: string | null;
};

const Player: React.FC = () => {
  const [song, setSong] = useState<SongData | null>(null);

  useEffect(() => {
    DeskThing.on('song', (data: SongData) => {
      setSong(data);
    });
  }, []);

  const sendCommand = (command: 'pause' | 'next' | 'previous' | 'play') => {
    DeskThing.send({ app: 'sonos-webapp', type: 'set', request: command });
  };

  if (!song) {
    return <div style={{ padding: '1rem' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
      {song.thumbnail && (
        <img
          src={song.thumbnail}
          alt="Album Art"
          style={{ width: '100px', height: '100px', borderRadius: '12px', marginBottom: '1rem' }}
        />
      )}
      <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{song.track_name}</div>
      <div style={{ color: '#888', fontSize: '0.95rem' }}>{song.artist}</div>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem' }}>
        <button onClick={() => sendCommand('previous')}>⏮</button>
        <button onClick={() => sendCommand('pause')}>⏯</button>
        <button onClick={() => sendCommand('next')}>⏭</button>
      </div>
    </div>
  );
};

export default Player;
