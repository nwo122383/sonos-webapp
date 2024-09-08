import React, { useEffect, useState } from 'react';
import './index.css';

const Favorites = () => {
    const [favorites, setFavorites] = useState([]);

    // Fetch favorites from the parent window when the component mounts
    useEffect(() => {
        window.parent.postMessage({
            type: 'IFRAME_ACTION',
            payload: {
                app: 'sonos-webapp',
                type: 'get',
                request: 'favorites'
            }
        }, '*');

        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'favorites') {
                setFavorites(event.data.payload);  // Set the favorites from the event data
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Handle click event for each favorite
    const handleFavoriteClick = (favorite) => {
        window.parent.postMessage({
            type: 'IFRAME_ACTION',
            payload: { app: 'sonos-webapp', type: 'set', request: 'playFavorite', payload: { uri: favorite.uri } }
        }, '*');
    };

    return (
        <div id="favorites-container" className="favorites-grid">
            {favorites.map((favorite) => (
                <div key={favorite.uri} className="favorite-item" onClick={() => handleFavoriteClick(favorite)}>
                    <img src={favorite.albumArt || 'default-image.jpg'} alt="Album Art" />
                    <div>{favorite.title}</div>
                </div>
            ))}
        </div>
    );
};

export default Favorites;
