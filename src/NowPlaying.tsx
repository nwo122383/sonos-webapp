import React, { useEffect, useState } from 'react';
import './index.css';

const NowPlaying = () => {
  const [songData, setSongData] = useState({
    track_name: 'Unknown Track',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    thumbnail: null,
  });

  useEffect(() => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'song',
        },
      },
      '*'
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'song' && event.data.payload) {
        setSongData(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div id="now-playing">
      {songData.thumbnail && <img src={songData.thumbnail} alt="Album Art" />}
      <div>
        <div><strong>{songData.track_name}</strong></div>
        <div>{songData.artist}</div>
        <div>{songData.album}</div>
      </div>
    </div>
  );
};

export default NowPlaying;
