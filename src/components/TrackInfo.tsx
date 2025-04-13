// src/components/TrackInfo.tsx

import React, { useEffect, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import './TrackInfo.css';

interface SongData {
  track_name: string;
  artist: string;
  album: string;
  thumbnail?: string | null;
}

const TrackInfo: React.FC = () => {
  const [song, setSong] = useState<SongData | null>(null);

  useEffect(() => {
    // Listen for now playing updates from backend
    const unsubscribe = DeskThing.on('song', (data) => {
      if (data?.payload) {
        setSong(data.payload);
      }
    });

    // Optionally: request the current now playing on load
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'nowPlaying' });

    return () => unsubscribe();
  }, []);

  if (!song) {
    return (
      <div className="now-playing">
        <p>Now Playing: Nothing</p>
      </div>
    );
  }

  return (
    <div className="now-playing">
      {song.thumbnail && (
        <img src={song.thumbnail} alt="Album Art" className="album-art" />
      )}
      <div className="track-details">
        <h3 className="track-title">{song.track_name}</h3>
        <p className="track-artist">{song.artist}</p>
        <p className="track-album">{song.album}</p>
      </div>
    </div>
  );
};

export default TrackInfo;
