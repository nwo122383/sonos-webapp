import React from "react";

export interface Episode {
  id: string;
  title: string;
  date?: string;
  class?: string;
  uri?: string;
  metaData?: string;
}

interface Props {
  episodes: Episode[];
  onSelect: (ep: Episode) => void;
  onClose: () => void;
}

const EpisodePickerModal: React.FC<Props> = ({ episodes, onSelect, onClose }) => (
  <div className="episode-picker-modal">
    <div className="overlay" onClick={onClose} />
    <div className="modal-content">
      <h3>Select Episode</h3>
      <ul>
        {episodes.map((ep, idx) => (
          <li key={ep.id || idx}>
            <button onClick={() => onSelect(ep)}>
              {ep.title}
              {ep.date ? <span> ({ep.date})</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={onClose}>Cancel</button>
    </div>
  </div>
);

export default EpisodePickerModal;

