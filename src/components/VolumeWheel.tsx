// src/components/VolumeWheel.tsx
import React from 'react';
import { DeskThing } from '@deskthing/client';

type Props = {
  selectedSpeakerUUIDs: string[];
  children: React.ReactNode;
  onLocalVolumeChange?: (v: number) => void;
  currentVolume: number;
  step?: number;       // base step
  yMultiplier?: number; // vertical sensitivity multiplier
};

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

const VolumeWheel: React.FC<Props> = ({
  selectedSpeakerUUIDs,
  children,
  onLocalVolumeChange,
  currentVolume,
  step = 2,
  yMultiplier = 1.0,
}) => {
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!Array.isArray(selectedSpeakerUUIDs) || selectedSpeakerUUIDs.length === 0) return;

    // Use both axes; many touchpads only emit deltaY.
    const magX = Math.abs(e.deltaX);
    const magY = Math.abs(e.deltaY);

    let dir = 0;
    if (magX >= magY) dir = e.deltaX > 0 ? 1 : e.deltaX < 0 ? -1 : 0;
    else dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;

    if (dir === 0) return;

    const effectiveStep = magY > magX ? Math.max(1, Math.round(step * yMultiplier)) : step;
    const nextVol = clamp(currentVolume + dir * effectiveStep);

    // Avoid page scroll stealing the gesture
    e.preventDefault();

    onLocalVolumeChange?.(nextVol);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'volumeChange',
      payload: { volume: nextVol, speakerUUIDs: selectedSpeakerUUIDs },
    });
  };

  return (
    <div onWheel={onWheel} style={{ touchAction: 'none' }}>
      {children}
    </div>
  );
};

export default VolumeWheel;
