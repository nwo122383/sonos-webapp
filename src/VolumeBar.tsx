import React, { useEffect, useState } from 'react';
import './index.css';

const VolumeBar = () => {
    const [volume, setVolume] = useState(null);  // Initialize volume as null to detect changes
    const [visible, setVisible] = useState(false);

    // Fetch the current volume when the component mounts
    useEffect(() => {
        console.log('Fetching current volume...');
        window.parent.postMessage({
            type: 'IFRAME_ACTION',
            payload: {
                app: 'sonos-webapp',
                type: 'get',
                request: 'volume'
            }
        }, '*');

        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'volumeChange') {
                console.log('Received volume change:', event.data.payload.volume);
                setVolume(event.data.payload.volume);  // Update the volume state
                setVisible(true);  // Show volume bar on change
            }
            if (event.data.type === 'currentVolume') {
                console.log('Received current volume:', event.data.payload.volume);
                setVolume(event.data.payload.volume);  // Set the initial volume from Sonos
                setVisible(true);  // Show the volume bar when volume is first fetched
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Handle hiding the volume bar 2 seconds after volume changes
    useEffect(() => {
        if (volume !== null) {  // Ensure volume is defined before showing the bar
            console.log('Showing volume bar');
            const hideTimeout = setTimeout(() => {
                setVisible(false);  // Hide the bar after 2 seconds
            }, 2000);

            return () => clearTimeout(hideTimeout);  // Clear timeout if volume changes again
        }
    }, [volume]);

    // Add event listener for wheel scroll to adjust volume
    useEffect(() => {
        const handleWheel = (event) => {
            if (event.deltaX !== 0) {
                const volumeChange = event.deltaX > 0 ? 5 : -5;  // Change by 5 units
                const newVolume = Math.min(100, Math.max(0, volume + volumeChange));

                console.log('Setting new volume:', newVolume);
                setVolume(newVolume);  // Update local state
                window.parent.postMessage({
                    type: 'IFRAME_ACTION',
                    payload: { app: 'sonos-webapp', type: 'set', request: 'volumeChange', payload: { volume: newVolume } }
                }, '*');
            }
        };

        window.addEventListener('wheel', handleWheel);

        return () => window.removeEventListener('wheel', handleWheel);
    }, [volume]);

    // Ensure the volume bar shows and adjusts the width based on the volume
    return (
        <div id="volume-bar" style={{ display: visible ? 'block' : 'none' }}>
            <div id="volume-fill" style={{ width: `${volume !== null ? volume : 0}%` }}></div>
        </div>
    );
};

export default VolumeBar;
