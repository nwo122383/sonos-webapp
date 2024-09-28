import React, { useEffect, useState } from 'react';

const Controls = () => {
  const [playMode, setPlayMode] = useState('NORMAL');

  useEffect(() => {
    // Request current play mode
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'get',
          request: 'playMode',
        },
      },
      '*'
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'playMode' && event.data.payload) {
        setPlayMode(event.data.payload.playMode);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const isShuffle = playMode.includes('SHUFFLE');
  const isRepeatOne = playMode === 'REPEAT_ONE';
  const isRepeatAll = playMode.includes('REPEAT') && !isRepeatOne;

  const handleShuffle = () => {
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'shuffle',
          payload: { state: !isShuffle },
        },
      },
      '*'
    );
  };

  const handleRepeat = () => {
    let newRepeatState: 'off' | 'all' | 'one';
    if (isRepeatOne) {
      newRepeatState = 'off';
    } else if (isRepeatAll) {
      newRepeatState = 'one';
    } else {
      newRepeatState = 'all';
    }
    window.parent.postMessage(
      {
        type: 'IFRAME_ACTION',
        payload: {
          app: 'sonos-webapp',
          type: 'set',
          request: 'repeat',
          payload: { state: newRepeatState },
        },
      },
      '*'
    );
  };

  return (
    <div className="controls">
      {/* Other controls like Play, Pause, Next, Previous */}
      <button onClick={handleShuffle}>
        Shuffle {isShuffle ? 'On' : 'Off'}
      </button>
      <button onClick={handleRepeat}>
        Repeat {isRepeatOne ? 'One' : isRepeatAll ? 'All' : 'Off'}
      </button>
    </div>
  );
};

export default Controls;
