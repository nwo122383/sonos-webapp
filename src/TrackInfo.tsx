import React, { useEffect, useState } from 'react';
import './index.css';
import DeskThing from 'deskthing-client';

const TrackInfo = () => {
    const [trackInfo, setTrackInfo] = useState({
        track_name: 'Unknown',
        artist: 'Unknown',
        album: 'Unknown',
        thumbnail: null,
    });

    // Fetch the track info from the backend, every 30 seconds
    useEffect(() => {
        const fetchTrackInfo = () => {
            console.log('Fetching track info...');
            DeskThing.send({
                app: 'sonos-webapp', type: 'get', request: 'song'
            })
        };

        // Fetch track info initially
        fetchTrackInfo();

        // Poll for track info every 30 seconds
        const intervalId = setInterval(fetchTrackInfo, 30000);

        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'song') {
                console.log('Received track info:', event.data.payload);
                setTrackInfo(event.data.payload);  // Update track info state
            }
        };

        window.addEventListener('message', handleMessage);

        // Cleanup interval and event listener on unmount
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return (
        <div id="track-info" className="track-info">
            <img id="album-art" src={trackInfo.thumbnail || 'default-image.jpg'} alt="Album Art" />
            <div id="track-name">Track: {trackInfo.track_name || 'Unknown'}</div>
            <div id="artist-name">Artist: {trackInfo.artist || 'Unknown'}</div>
            <div id="album-name">Album: {trackInfo.album || 'Unknown'}</div>
        </div>
    );
};

export default TrackInfo;
