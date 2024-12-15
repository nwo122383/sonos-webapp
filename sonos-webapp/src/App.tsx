import React from 'react';
import ReactDOM from 'react-dom';
import TrackInfo from './TrackInfo';
import Favorites from './Favorites';
import VolumeBar from './VolumeBar';
import VolumeControl from './VolumeControl'
import PlaybackControl from './PlaybackControl';
import Controls from './Controls';
import './index.css';

const App = () => {
    return (
      <div className="app-container">
        <VolumeBar />
        <div className="top-controls">
          <VolumeControl />
                  </div>
        <div className="favorites-section">
          {/* Favorites will be rendered here */}
          <Favorites />
        </div>
      </div>
    );
  };

export default App;