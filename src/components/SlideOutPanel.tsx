// src/components/SlideOutPanel.tsx

import React from 'react';
import './SlideOutPanel.css';
import { Favorite } from './Favorites';

interface SlideOutPanelProps {
  open: boolean;
  onClose: () => void;
  items: Favorite[];
  onPlay: (fav: Favorite) => void;
  onBrowse: (fav: Favorite) => void;
}

const SlideOutPanel: React.FC<SlideOutPanelProps> = ({ open, onClose, items, onPlay, onBrowse }) => {
  return (
    <div className={`slideout-panel ${open ? 'open' : ''}`}>
      <div className="slideout-header">
        <h2>Shows & Podcasts</h2>
        <button onClick={onClose} className="close-button">✖</button>
      </div>
      <div className="slideout-content">
        {items.length === 0 ? (
          <div className="empty">No items found</div>
        ) : (
          <div className="item-grid">
            {items.map((item) => (
              <div key={item.id} className="item-card">
                <img src={item.albumArt || 'default-image.jpg'} alt={item.title} />
                <div className="item-title">{item.title}</div>
                <div className="item-buttons">
                  {item.uri && (
                    <button onClick={() => onPlay(item)}>▶ Play</button>
                  )}
                  {item.isContainer && (
                    <button onClick={() => onBrowse(item)}>📁 Browse</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideOutPanel;
