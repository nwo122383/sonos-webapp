import React from 'react';

interface EpisodeItem {
  title: string;
  uri: string;
  metaData?: string;
}

interface EpisodeSelectorProps {
  episodes: EpisodeItem[];
  onSelect: (episode: EpisodeItem) => void;
  onClose: () => void;
}

const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({ episodes, onSelect, onClose }) => {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2>Select an Episode</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {episodes.map((episode, idx) => (
            <li key={idx} style={{ margin: '10px 0' }}>
              <button style={buttonStyle} onClick={() => onSelect(episode)}>
                {episode.title}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onClose} style={closeButtonStyle}>Close</button>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  padding: '20px',
  borderRadius: '10px',
  width: '400px',
  maxHeight: '80vh',
  overflowY: 'auto',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 15px',
  fontSize: '16px',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
};

const closeButtonStyle: React.CSSProperties = {
  marginTop: '20px',
  padding: '10px 15px',
  fontSize: '16px',
  cursor: 'pointer',
  backgroundColor: '#ccc',
  border: 'none',
  borderRadius: '5px',
};

export default EpisodeSelector;
