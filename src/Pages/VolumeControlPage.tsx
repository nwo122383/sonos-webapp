import React, { useState, useEffect } from 'react';
import './VolumeControlPage.css';
import DeskThing from 'deskthing-client';

const VolumeControlPage: React.FC = () => {
  const [speakers, setSpeakers] = useState<string[]>([]); // Fetch speakers from your source

  const incrementVolume = (uuid: string) => {
    // Increase the volume for the specified speaker
    DeskThing.send({ // Use deskthing directly
      type: 'set',
      request: 'volumeChange',
      payload: { speakerUUID: uuid, volume: '+5' },
    });
  };

  const decrementVolume = (uuid: string) => {
    // Decrease the volume for the specified speaker
    DeskThing.send({ // use DeskThing directly
      type: 'set',
      request: 'volumeChange',
      payload: { speakerUUID: uuid, volume: '-5' },
    });
  };

  useEffect(() => {
    // Placeholder logic to load speakers
    setSpeakers(['Speaker 1', 'Speaker 2', 'Speaker 3']);
  }, []);

  return (
    <div className="volume-control-page w-screen h-screen flex flex-col items-center justify-center bg-gray-800 text-white">
      <h1 className="text-4xl mb-6">Select a Speaker to Adjust Volume</h1>
      {speakers.map((speaker) => (
        <div key={speaker} className="flex items-center mb-4">
          <h2 className="mr-4">{speaker}</h2>
          <button className="bg-blue-500 px-4 py-2 mr-2" onClick={() => decrementVolume(speaker)}>
            -
          </button>
          <button className="bg-blue-500 px-4 py-2" onClick={() => incrementVolume(speaker)}>
            +
          </button>
        </div>
      ))}
    </div>
  );
};

export default VolumeControlPage;
