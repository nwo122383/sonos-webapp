// src/components/Controls.tsx

import React, { useState } from 'react';
import './index.css';
import { DeskThing } from 'deskthing-client';

const Controls = () => {
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState<'off' | 'all' | 'one'>('off');

  const sendControlCommand = (command: string) => {
    // DeskThing.send does the same thing as window.parent.postMessage()
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: command,
    })
  };

  const sendShuffleCommand = (state: boolean) => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'shuffle',
      payload: { state },
    })
  };
  
  const sendRepeatCommand = (state: boolean) => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'repeat',
      payload: { state },
    })
  };
  const toggleShuffle = () => {
    const newState = !shuffleState;
    setShuffleState(newState);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'shuffle',
      payload: { state: newState },
    })
  };

  const cycleRepeat = () => {
    let newState: 'off' | 'all' | 'one';
    if (repeatState === 'off') {
      newState = 'all';
    } else if (repeatState === 'all') {
      newState = 'one';
    } else {
      newState = 'off';
    }
    setRepeatState(newState);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'repeat',
      payload: { state: newState },
    })
  };

  return (
    <div className="controls">
      <button onClick={() => sendControlCommand('previous')}>Previous</button>
      <button onClick={() => sendControlCommand('play')}>Play</button>
      <button onClick={() => sendControlCommand('pause')}>Pause</button>
      <button onClick={() => sendControlCommand('next')}>Next</button>
      <button onClick={toggleShuffle}>{shuffleState ? 'Disable Shuffle' : 'Enable Shuffle'}</button>
      <button onClick={cycleRepeat}>Repeat: {repeatState}</button>
    </div>
  );
};

export default Controls;
