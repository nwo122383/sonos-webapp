// ===============================
// src/components/VolumeControl.tsx
// ===============================
//
// Volume selection UI (decoupled).
// - Chips manage only selectedVolumeSpeakers
// - +/- buttons send adjustVolume with explicit speakerUUIDs
// - Never touches selectSpeakers/selectPlaybackSpeakers

import React, { useEffect, useRef, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import './VolumeControl.css';

type Speaker = { uuid: string; zoneName: string };

const toArray = <T,>(v: unknown, fb: T[] = []): T[] => (Array.isArray(v) ? (v as T[]) : fb);

const VolumeControl: React.FC = () => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const volumeFetchTimeout = useRef<number | null>(null);

  useEffect(() => {
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'speakersList' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedVolumeSpeakers' });

    const offSpeakers = DeskThing.on('speakersList', (msg) => {
      setSpeakers(toArray<Speaker>((msg as any)?.payload));
    });

    const offVolSel = DeskThing.on('selectedVolumeSpeakers', (msg) => {
      setSelected(toArray<string>((msg as any)?.payload?.uuids));
    });

    return () => { try { offSpeakers?.(); offVolSel?.(); } catch {} };
  }, []);

  const pushSelection = (uuids: string[]) => {
    setSelected(uuids);
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'selectVolumeSpeakers',
      payload: { uuids },
    });
  };

  const toggleChip = (uuid: string) => {
    const next = selected.includes(uuid) ? selected.filter(u => u !== uuid) : [...selected, uuid];
    pushSelection(next);
  };

  const toggleAll = () => {
    const all = speakers.map(s => s.uuid);
    const next = selected.length === speakers.length ? [] : all;
    pushSelection(next);
  };

  const adjust = (delta: number) => {
    if (selected.length === 0) return;
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'adjustVolume',
      payload: { delta, speakerUUIDs: selected },
    });
    // Optional: refresh volume after a short debounce
    if (volumeFetchTimeout.current) window.clearTimeout(volumeFetchTimeout.current);
    volumeFetchTimeout.current = window.setTimeout(() => {
      DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'volume' });
    }, 300);
  };

  const allSelected = speakers.length > 0 && selected.length === speakers.length;

  return (
    <div id="volume-control" className="vc-root">
      <div className="vc-header">
        <h2>Volume Speakers</h2>
        <button
          className={`vc-chip vc-chip--all ${allSelected ? 'vc-chip--all-selected' : ''}`}
          onClick={toggleAll}
          title={allSelected ? 'Deselect all' : 'Select all'}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="vc-chiprow">
        {speakers.map((sp) => {
          const sel = selected.includes(sp.uuid);
          return (
            <button
              key={sp.uuid}
              className={`vc-chip ${sel ? 'vc-chip--selected' : ''}`}
              onClick={() => toggleChip(sp.uuid)}
              title={sp.zoneName}
            >
              {sp.zoneName}
            </button>
          );
        })}
        {speakers.length === 0 && <span className="vc-loading">No speakers found.</span>}
      </div>

      <div className="vc-controls">
        <button className="vc-btn" onClick={() => adjust(-5)} aria-label="Volume down">–</button>
        <button className="vc-btn" onClick={() => adjust(+5)} aria-label="Volume up">+</button>
      </div>
    </div>
  );
};

export default VolumeControl;
