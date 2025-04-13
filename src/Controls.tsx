import React, { useState } from 'react';
import { DeskThing } from '@deskthing/client';
import './index.css';

const Controls = () => {
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState<'off' | 'all' | 'one'>('off');

  const sendControlCommand = (command: 'play' | 'pause' | 'next' | 'previous') => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: command,
    });
  };

  const toggleShuffle = () => {
    const newState = !shuffleState;
    setShuffleState(newState);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'shuffle',
      payload: { state: newState },
    });
  };

  const cycleRepeat = () => {
    const nextState = repeatState === 'off' ? 'all' : repeatState === 'all' ? 'one' : 'off';
    setRepeatState(nextState);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'repeat',
      payload: { state: nextState },
    });
  };

  return (
    <div className="controls">
      <button onClick={() => sendControlCommand('previous')}>Previous</button>
      <button onClick={() => sendControlCommand('play')}>Play</button>
      <button onClick={() => sendControlCommand('pause')}>Pause</button>
      <button onClick={() => sendControlCommand('next')}>Next</button>
      <button onClick={toggleShuffle}>
        {shuffleState ? 'Disable Shuffle' : 'Enable Shuffle'}
      </button>
      <button onClick={cycleRepeat}>Repeat: {repeatState}</button>
    </div>
  );
};

export default Controls;
