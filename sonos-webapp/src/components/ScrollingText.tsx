import React from 'react';
import './ScrollingText.css';

interface ScrollingTextProps {
  text: string;
  fadeWidth?: number;
}

export const ScrollingText: React.FC<ScrollingTextProps> = ({ text, fadeWidth = 24 }) => {
  return (
    <div className="scrolling-text-container" style={{ paddingRight: fadeWidth }}>
      <div className="scrolling-text-content">{text}</div>
    </div>
  );
};
