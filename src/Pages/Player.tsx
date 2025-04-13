import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SongData } from '@deskthing/types'
import { DeskThing } from '@deskthing/client'// Assuming MusicStore exists in your Stores directory
import Loading from './Loading'; // Import the Loading component we created
import { ScrollingText } from '../components/ScrollingText'; // Import the ScrollingText component we created
import './Player.css';

const Player: React.FC = () => {
  // Use deskthing now instead of a music store
  const deskThing = DeskThing.getInstance();
  const navigate = useNavigate();
  const [currentSong, setCurrentSong] = useState<SongData | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<string>('');

  useEffect(() => {
    const updateSong = (songData?: SongData) => {
      if (songData) {
        setCurrentSong(songData);
        setBackgroundColor(songData?.color?.rgb || 'rgb(128, 128, 128)') // Use the new background color module
      }
    };

    const unsubscribe = deskThing.on('music', (songData) => updateSong(songData.payload));

    const fetchInitialData = async () => { // put this into a function
      // getMusic() will automatically fetch data    
      const song = await deskThing.getMusic();
      if (song) {
        setCurrentSong(song);
      }
    }

    fetchInitialData()

    return () => {
      unsubscribe();
    };
  }, []);

  const handleTouchStart = useRef<number | null>(null);

  const handleTouchStartEvent = (e: React.TouchEvent<HTMLDivElement>) => {
    handleTouchStart.current = e.touches[0].clientX;
  };

  const handleTouchEndEvent = (e: React.TouchEvent<HTMLDivElement>) => {
    if (handleTouchStart.current !== null) {
      const touchEndX = e.changedTouches[0].clientX;
      const screenWidth = window.innerWidth;
      const leftThreshold = screenWidth * 0.2; // 20% from the left
      const rightThreshold = screenWidth * 0.8; // 20% from the right

      if (touchEndX < leftThreshold) {
        navigate('/volume-control');
      } else if (touchEndX > rightThreshold) {
        navigate('/favorites');
      }
    }
  };

  if (!currentSong || Object.keys(currentSong).length === 0) {
    return (
      <div className="w-screen h-screen">
        <Loading text="Loading Song..." />
      </div>
    );
  }

  return (
    <div
      className="player-container w-screen h-screen font-geist text-white font-semibold flex"
      style={{ backgroundColor }}
      onTouchStart={handleTouchStartEvent}
      onTouchEnd={handleTouchEndEvent}
    >
      <div className="album-art-container">
        <div className="w-[35vw] h-[35vw]">
          {currentSong.thumbnail && (
            <img src={currentSong.thumbnail} alt={`${currentSong.album} cover`} />
          )}
        </div>
      </div>

      <div className="track-info-container">
        <div className="pl-5 h-[35vw] flex flex-col justify-center relative">
          <p className="top-0 absolute">{currentSong.album}</p>
          <h1 className="text-4xl">
            <ScrollingText text={currentSong.track_name} fadeWidth={24} />
          </h1>
          <h1>{currentSong.artist}</h1>
        </div>
      </div>
    </div>
  );
};

export default Player;
