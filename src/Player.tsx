import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MusicStore } from '../Stores/musicStore';
import { SongData } from 'deskthing-client/dist/types';
import Loading from './Loading';
import { ScrollingText } from '../components/ScrollingText';
import './Player.css';

const Player: React.FC = () => {
  const musicStore = MusicStore.getInstance();
  const navigate = useNavigate();
  const [currentSong, setCurrentSong] = useState<SongData | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<string>('');

  useEffect(() => {
    const updateSong = async (song?: SongData, backgroundColor?: number[]) => {
      if (song && backgroundColor) {
        setCurrentSong(song);
        setBackgroundColor(`rgba(${backgroundColor.join(',')}, 0.5)`);
      }
    };

    const unsubscribe = musicStore.on('music', (a, b) => updateSong(a as SongData, b as number[]));

    const song = musicStore.getSong();
    if (song) {
      setCurrentSong(song);
    } else {
      musicStore.fetchInitialSong();
    }

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
      <div className="absolute left-0 transition-all h-full w-1/2 flex items-center justify-end">
        <div className="w-[35vw] h-[35vw]">
          {currentSong.thumbnail && (
            <img src={currentSong.thumbnail} alt={`${currentSong.album} cover`} />
          )}
        </div>
      </div>

      <div className="font-geist absolute right-0 transition-all w-1/2 h-full flex justify-center flex-col">
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
