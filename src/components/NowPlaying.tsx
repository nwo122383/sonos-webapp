// src/components/NowPlaying.tsx
// (Same functionality as your current, only styles are bigger via CSS below)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './NowPlaying.css';

type NowPlayingData = {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  isPlaying?: boolean;
  position?: number;
  duration?: number;
};

type Props = {
  selectedSpeakerUUIDs: string[];
  currentVolume: number;
  onLocalVolumeChange: (vol: number) => void;
};

type TransportState = 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED' | 'UNKNOWN';
type Speaker = { uuid: string; zoneName: string };

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const normalizeThumb = (t?: string | null): string | undefined =>
  !t ? undefined : t.startsWith('data:') || t.startsWith('http') ? t : `data:image/jpeg;base64,${t}`;
const secondsToClock = (n?: number): string => {
  if (!n || n < 0 || !isFinite(n)) return '0:00';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const NowPlaying: React.FC<Props> = ({ selectedSpeakerUUIDs, currentVolume, onLocalVolumeChange }) => {
  const [np, setNp] = useState<NowPlayingData>({});
  const [muted, setMuted] = useState<boolean>(false);
  const [transportState, setTransportState] = useState<TransportState>('UNKNOWN');
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [playbackSel, setPlaybackSel] = useState<string[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const ingest = (p: any): NowPlayingData => ({
      title: p?.track_name ?? p?.title ?? p?.name ?? '',
      artist: p?.artist ?? '',
      album: p?.album ?? '',
      albumArt: normalizeThumb(p?.thumbnail ?? p?.albumArt ?? p?.image),
      isPlaying: p?.isPlaying ?? undefined,
      position: typeof p?.position === 'number' ? p.position : undefined,
      duration: typeof p?.duration === 'number' ? p.duration : undefined,
    });

    const offSong = DeskThing.on('song', (data: SocketData) => {
      if (data.type !== 'song') return;
      setNp(ingest(data.payload));
    });
    const offMusic = DeskThing.on('music', (data: SocketData) => {
      if (data.type !== 'music') return;
      setNp(ingest(data.payload));
    });

    const offMute = DeskThing.on('mute', (msg: SocketData) => {
      if (msg.type !== 'mute') return;
      const m = (msg.payload as any)?.muted;
      if (typeof m === 'boolean') setMuted(m);
    });
    const offState = DeskThing.on('transportState', (msg: SocketData) => {
      if (msg.type !== 'transportState') return;
      const s = String((msg.payload as any)?.state || 'UNKNOWN').toUpperCase();
      setTransportState(
        s === 'PLAYING' || s === 'PAUSED_PLAYBACK' || s === 'STOPPED' ? (s as TransportState) : 'UNKNOWN'
      );
    });

    const offSpeakers = DeskThing.on('speakersList', (msg: SocketData) => {
      if (msg.type !== 'speakersList') return;
      const list = Array.isArray(msg.payload) ? msg.payload : [];
      setSpeakers(list.map((s: any) => ({ uuid: s.uuid, zoneName: s.zoneName })));
    });
    const offSelPlayback = DeskThing.on('selectedPlaybackSpeakers', (msg: SocketData) => {
      if (msg.type !== 'selectedPlaybackSpeakers') return;
      const uuids: string[] = (msg.payload as any)?.uuids || [];
      if (Array.isArray(uuids)) setPlaybackSel(uuids);
    });

    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'mute' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'transportState' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'speakersList' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'selectedPlaybackSpeakers' });

    return () => {
      offSong();
      offMusic();
      try { offMute?.(); offState?.(); offSpeakers?.(); offSelPlayback?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    const playing =
      transportState === 'PLAYING' || (transportState === 'UNKNOWN' && np.isPlaying === true);
    if (!playing || !np.duration || np.duration <= 0) return;

    tickRef.current = window.setInterval(() => {
      setNp((prev) => {
        if (!prev.duration) return prev;
        const nextPos = Math.min((prev.position ?? 0) + 1, prev.duration);
        return { ...prev, position: nextPos };
      });
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [transportState, np.isPlaying, np.duration]);

  const progress = useMemo(() => {
    const pos = np.position ?? 0;
    const dur = np.duration ?? 0;
    if (dur <= 0) return 0;
    return Math.min(100, Math.max(0, (pos / dur) * 100));
  }, [np.position, np.duration]);

  const isPlaying =
    transportState === 'PLAYING'
      ? true
      : transportState === 'PAUSED_PLAYBACK' || transportState === 'STOPPED'
      ? false
      : !!np.isPlaying;

  const togglePlayPause = () => {
    DeskThing.send({ app: 'sonos-webapp', type: 'set', request: isPlaying ? 'pause' : 'play' });
  };
  const toggleMute = () =>
    DeskThing.send({ app: 'sonos-webapp', type: 'set', request: 'mute', payload: { state: 'toggle' } });

  const speakerMap = useMemo(() => {
    const m = new Map<string, string>();
    speakers.forEach((s) => m.set(s.uuid, s.zoneName));
    return m;
  }, [speakers]);
  const primaryUUID =
    (playbackSel && playbackSel[0]) ||
    (Array.isArray(selectedSpeakerUUIDs) && selectedSpeakerUUIDs[0]) ||
    '';
  const speakerName = primaryUUID ? speakerMap.get(primaryUUID) || 'Unknown Speaker' : 'Unknown Speaker';

  return (
    <div className="np">
      <div className="np__art">
        {np.albumArt ? <img src={np.albumArt} alt="" /> : <div className="np__noart">No Art</div>}
      </div>

      <div className="np__center">
        <div className="np__line1">
          <div className="np__title" title={np.title || ''}>{np.title || '—'}</div>
          <div className="np__metaRight">
            <span className="np__vol">Vol&nbsp;{clamp(currentVolume)}%</span>
            <span className="np__dot">•</span>
            <span className="np__speaker" title={speakerName}>{speakerName}</span>
          </div>
        </div>
        <div className="np__artist" title={np.artist || ''}>{np.artist || '—'}</div>

        <div className="np__progress">
          <div className="np__bar"><div className="np__barFill" style={{ width: `${progress}%` }} /></div>
          <div className="np__time">
            <span>{secondsToClock(np.position)}</span>
            <span>{secondsToClock(np.duration)}</span>
          </div>
        </div>
      </div>

      <div className="np__controls">
        <button
          className="np__btn"
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className={`np__btn ${muted ? 'np__btn--active' : ''}`}
          onClick={toggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔈'}
        </button>
      </div>
    </div>
  );
};

export default NowPlaying;
