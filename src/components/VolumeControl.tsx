// src/components/VolumeControl.tsx

import React, { useEffect, useState, useRef } from 'react';
import { DeskThing } from '@deskthing/client';
import './VolumeControl.css';

interface Speaker {
  uuid: string;
  zoneName: string;
}

const VolumeControl: React.FC = () => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const volumeFetchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'speakersList' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedVolumeSpeakers' });

    const unsubSpeakers = DeskThing.on('speakersList', (data) => {
      const all = data.payload as { uuid: string; zoneName: string }[];
      setSpeakers(all);

      // fallback if none selected
      if (all.length && selected.length === 0) {
        const fallback = all[0].uuid;
        setSelected([fallback]);
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'set',
          request: 'selectVolumeSpeakers',
          payload: { uuids: [fallback] },
        });
      }
    });

    const unsubSelected = DeskThing.on('selectedVolumeSpeakers', (data) => {
      if (data.payload?.uuids) {
        setSelected(data.payload.uuids);
      }
    });

    return () => {
      unsubSpeakers();
      unsubSelected();
    };
  }, []);

  const toggleVolumeSpeaker = (uuid: string) => {
    const updated = selected.includes(uuid)
      ? selected.filter((u) => u !== uuid)
      : [...selected, uuid];

    setSelected(updated);

    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'selectVolumeSpeakers',
      payload: { uuids: updated },
    });
  };

  const adjustVolume = (delta: number) => {
    DeskThing.send({
      app: 'sonos-webapp',
      type: 'set',
      request: 'adjustVolume',
      payload: { delta },
    });

    // Debounce fetching the updated volume after the change
    if (volumeFetchTimeout.current) {
      clearTimeout(volumeFetchTimeout.current);
    }

    volumeFetchTimeout.current = setTimeout(() => {
      selected.forEach((uuid) => {
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'get',
          request: 'volume',
          payload: { speakerUUIDs: [uuid] },
        });
      });
    }, 500);
  };

  return (
    <div id="volume-control">
      <h2>Volume Speakers</h2>
      <div className="speakers-list">
        {speakers.map((speaker) => (
          <div key={speaker.uuid} style={{ marginBottom: '0.5rem' }}>
            <button
              className={`p-2 rounded m-1 ${
                selected.includes(speaker.uuid) ? 'bg-green-600' : 'bg-gray-100'
              }`}
              onClick={() => toggleVolumeSpeaker(speaker.uuid)}
            >
              {speaker.zoneName}
            </button>
          </div>
        ))}
      </div>

      <div className="volume-controls mt-4">
        <button onClick={() => adjustVolume(-5)} className="volume-minus-button">-</button>
        <button onClick={() => adjustVolume(5)} className="volume-plus-button">+</button>
      </div>
    </div>
  );
};

export default VolumeControl;
