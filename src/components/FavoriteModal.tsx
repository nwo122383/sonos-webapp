import React, { useEffect, useState } from 'react';
import { DeskThing, SocketData } from '@deskthing/client';
import './FavoriteModal.css';

type BrowseItem = {
  title: string;
  albumArt: string | null;
  uri: string;
  metaData: string;
  isContainer: boolean;
  id: string;
  browseId: string;
};

type FavoriteModalProps = {
  favoriteId: string;
  speakerIP: string;
  onClose: () => void;
};

const FavoriteModal: React.FC<FavoriteModalProps> = ({ favoriteId, speakerIP, onClose }) => {
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleResults = (items: BrowseItem[]) => {
      console.log('[FavoriteModal] Received browseFavoriteResults:', items);
      if (!items || items.length === 0) {
        setError('No items found in this favorite. It may not be playable.');
      } else {
        setBrowseItems(items);
        setError(null);
      }
    };

    const handleError = (msg: string) => {
      console.log('[FavoriteModal] Received browseFavoriteError:', msg);
      setError(msg || 'Failed to browse favorite.');
    };

    DeskThing.on('browseFavoriteResults', handleResults);
    DeskThing.on('browseFavoriteError', handleError);

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'browseFavorite',
      payload: {
        objectId: favoriteId,
        speakerIP,
      },
    });

    return () => {
      DeskThing.off('browseFavoriteResults', handleResults);
      DeskThing.off('browseFavoriteError', handleError);
    };
  }, [favoriteId, speakerIP]);

  const handleItemClick = (item: BrowseItem) => {
    console.log('[FavoriteModal] Playing browsed item:', item);

    if (!item.uri || !item.metaData) {
      alert('This item does not have a valid URI or metadata.');
      return;
    }

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'playFavorite',
      payload: {
        uri: item.uri,
        metaData: item.metaData,
        speakerIP,
      },
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Select an Item</h2>
        {error ? (
          <div className="modal-error">
            <p>{error}</p>
            <button onClick={onClose}>OK</button>
          </div>
        ) : (
          <div className="modal-items-grid">
            {browseItems.map((item) => (
              <div key={item.id} className="modal-item" onClick={() => handleItemClick(item)}>
                <img src={item.albumArt || 'default-image.jpg'} alt={item.title} />
                <div className="modal-title">{item.title}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="modal-close-button">
          ✖ Close
        </button>
      </div>
    </div>
  );
};

export default FavoriteModal;
