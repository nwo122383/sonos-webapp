import React from 'react';
import './Loading.css';

interface LoadingProps {
  text?: string;
}

const Loading: React.FC<LoadingProps> = ({ text }) => {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <div className="loading-text">{text || 'Loading...'}</div>
    </div>
  );
};

export default Loading;
