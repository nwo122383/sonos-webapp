import React from 'react';
import './ScrollingText.css';

interface ScrollingTextProps {
  text: string;
  fadeWidth?: number;
  intervalMs?: number;
}

export const ScrollingText: React.FC<ScrollingTextProps> = ({ text, fadeWidth = 24, intervalMs }) => {
  const durationMs = typeof intervalMs === 'number' ? intervalMs : 30000;
  const shouldScroll = durationMs > 0;
  const contentStyle: React.CSSProperties = shouldScroll
    ? ({
        ['--scroll-duration' as any]: `${Math.max(1000, durationMs) / 1000}s`,
      } as React.CSSProperties)
    : ({ animation: 'none' } as React.CSSProperties);

  return (
    <div className="scrolling-text-container" style={{ paddingRight: fadeWidth }}>
      <div
        className={`scrolling-text-content${shouldScroll ? '' : ' scrolling-text-content--static'}`}
        style={contentStyle}
      >
        {text}
      </div>
    </div>
  );
};
