import React from 'react';
import { Favorite } from './Favorites';
import './FavoriteModal.css';

interface Props {
  items: Favorite[];
  onClose: () => void;
  onPlay: (fav: Favorite) => void;
  onBrowse: (fav: Favorite) => void;
}

const FavoriteModal: React.FC<Props> = ({ items, onClose, onPlay, onBrowse }) => {
  return (
    <div className="modal-overlay">
      <div className="favorite-modal">
        <button className="close-button" onClick={onClose}>
          Close
        </button>
        <div className="modal-grid">
          {items.map((fav) => (
            <div key={fav.id} className="modal-item">
              <img src={fav.albumArt || ''} alt={fav.title} />
              <div className="modal-title">{fav.title}</div>
              <div className="modal-actions">
                <button onClick={() => onPlay(fav)}>Play</button>
                {fav.isContainer && (
                  <button onClick={() => onBrowse(fav)}>Browse</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FavoriteModal;
