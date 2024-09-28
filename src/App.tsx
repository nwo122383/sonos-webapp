import React from 'react';
import TrackInfo from './TrackInfo';
import Favorites from './Favorites';
import VolumeBar from './VolumeBar';
import './index.css';

const App = () => {
    return (
        <div>
            <Favorites />
            <VolumeBar />
        </div>
    );
};



export default App;
