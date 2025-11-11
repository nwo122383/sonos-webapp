// src/components/NowPlaying.tsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './NowPlaying.css';
import { ScrollingText } from './ScrollingText';
import { SettingsContext } from '../contexts/SettingsContext';

type NowPlayingWire = {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  thumbnail?: string;
  image?: string;
  isPlaying?: boolean;
  position?: number; // seconds
  duration?: number; // seconds
};

type Props = {
  selectedSpeakerUUIDs: string[];  // can be empty; we send volumeChange elsewhere
  currentVolume: number;
  onLocalVolumeChange: (vol: number) => void;
};

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

const normalizeThumb = (t?: string | null): string | undefined => {
  if (!t) return undefined;
  if (t.startsWith('data:') || t.startsWith('http')) return t;
  return `data:image/jpeg;base64,${t}`;
};

const toClock = (s?: number): string => {
  if (!s || s < 0 || !Number.isFinite(s)) return '0:00';
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return hh > 0
    ? `${hh}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
    : `${mm}:${ss.toString().padStart(2, '0')}`;
};

function makeTrackKey(p: Partial<NowPlayingWire>): string {
  // A simple “what track are we on?” key
  const t = (p.title || '').trim();
  const a = (p.artist || '').trim();
  const al = (p.album || '').trim();
  return `${t}::${a}::${al}`;
}

const NowPlaying: React.FC<Props> = ({ selectedSpeakerUUIDs, currentVolume, onLocalVolumeChange }) => {
  const { settings } = useContext(SettingsContext);
  // Canonical “what’s playing”
  const [title, setTitle] = useState<string>('');
  const [artist, setArtist] = useState<string>('');
  const [album, setAlbum] = useState<string>('');
  const [albumArt, setAlbumArt] = useState<string | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Time/progress (seconds)
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Derived
  const progressPct = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    const p = Math.max(0, Math.min(position, duration));
    return (p / duration) * 100;
  }, [position, duration]);

  // Internal refs to manage timers
  const tickRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const driftRef = useRef<number | null>(null);
  const lastTrackKeyRef = useRef<string>('');

  // --- transport controls ---
  const play = () => DeskThing.send({ app: 'sonos-webapp', type: 'set', request: 'play' });
  const pause = () => DeskThing.send({ app: 'sonos-webapp', type: 'set', request: 'pause' });
  const quickMute = () => {
    // Use your existing mute toggle (server toggles if no state is given)
    DeskThing.send({ app: 'sonos-webapp', type: 'set', request: 'mute', payload: { state: 'toggle' } });
  };

  // Merge “song/music” payloads into state
  const ingestWire = (wire: NowPlayingWire) => {
    const nextTitle = String(wire.title ?? '').trim()
      || String((wire as any).track_name ?? '').trim()
      || String((wire as any).name ?? '').trim();
    const nextArtist = String(wire.artist ?? '').trim();
    const nextAlbum = String(wire.album ?? '').trim();
    const nextArt = normalizeThumb(wire.albumArt || wire.thumbnail || wire.image);

    const nextKey = makeTrackKey({ title: nextTitle, artist: nextArtist, album: nextAlbum });

    // If track changed, reset timers and ask the server for fresh positionInfo
    if (nextKey && nextKey !== lastTrackKeyRef.current) {
      lastTrackKeyRef.current = nextKey;
      setPosition(0);
      // If wired duration exists in payload, use it; otherwise we’ll fetch.
      setDuration(Number.isFinite(wire.duration || NaN) ? Number(wire.duration) : 0);
      // Ask server for positionInfo immediately to lock in accurate counters
      DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'positionInfo' });
    }

    setTitle(nextTitle);
    setArtist(nextArtist);
    setAlbum(nextAlbum);
    setAlbumArt(nextArt);
    if (typeof wire.isPlaying === 'boolean') {
      setIsPlaying(wire.isPlaying);
    }
  };

  // Subscriptions
  useEffect(() => {
    const offSong = DeskThing.on('song', (data: SocketData) => {
      if (data?.type !== 'song') return;
      ingestWire((data.payload || {}) as NowPlayingWire);
    });
    const offMusic = DeskThing.on('music', (data: SocketData) => {
      if (data?.type !== 'music') return;
      ingestWire((data.payload || {}) as NowPlayingWire);
    });
    const offTransport = DeskThing.on('transportState', (data: SocketData) => {
      if (data?.type !== 'transportState') return;
      const s = String((data.payload as any)?.state || '').toUpperCase();
      setIsPlaying(s === 'PLAYING');
      // Also refresh position so UI snaps to the device’s counters
      DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'positionInfo' });
    });
    const offPos = DeskThing.on('positionInfo', (data: SocketData) => {
      if (data?.type !== 'positionInfo') return;
      const pos = Number((data.payload as any)?.position ?? 0);
      const dur = Number((data.payload as any)?.duration ?? 0);
      if (Number.isFinite(pos)) setPosition(pos);
      if (Number.isFinite(dur)) setDuration(dur);
    });

    // Initial snapshots so the widget has data right away
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'transportState' });
    DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'positionInfo' });

    return () => {
      try { offSong?.(); offMusic?.(); offTransport?.(); offPos?.(); } catch {}
    };
  }, []);

  // Local ticker when playing: we count 1s locally, but correct using periodic server polls
  useEffect(() => {
    // Clear any existing intervals
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (driftRef.current) { window.clearTimeout(driftRef.current); driftRef.current = null; }

    if (isPlaying) {
      // 1) local increment each second (only if we actually have a position)
      tickRef.current = window.setInterval(() => {
        setPosition((p) => {
          if (duration > 0) return Math.min(duration, p + 1);
          return p + 1;
        });
      }, 1000);

      // 2) ask device for authoritative counters every 3s to correct drift
      pollRef.current = window.setInterval(() => {
        DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'positionInfo' });
      }, 3000);

      // 3) small delayed correction after starting playback
      driftRef.current = window.setTimeout(() => {
        DeskThing.send({ app: 'sonos-webapp', type: 'get', request: 'positionInfo' });
      }, 750);
    }

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (driftRef.current) window.clearTimeout(driftRef.current);
      tickRef.current = null;
      pollRef.current = null;
      driftRef.current = null;
    };
  }, [isPlaying, duration]);

  // UI bits
  const leftTime = toClock(position);
  const rightTime = duration > 0 ? toClock(duration) : '—';
  const showProgress = duration > 0;

  const marqueeInterval = Number(settings?.marquee_interval_ms);
  const scrollInterval = Number.isFinite(marqueeInterval) ? marqueeInterval : 30000;

  return (
    <div className="nowplaying">
      <div className="nowplaying__art">
        {albumArt ? (
          <img src={albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 4 }}>No Art</span>
        )}
      </div>

      <div className="nowplaying__meta">
        <div className="nowplaying__title" title={title || ''}>
          <ScrollingText text={title || '—'} fadeWidth={40} intervalMs={scrollInterval} />
        </div>
        <div
          className="nowplaying__artist"
          title={`${artist || 'Unknown Artist'}${album ? ` • ${album}` : ''}`}
        >
          <ScrollingText
            text={`${artist || 'Unknown Artist'}${album ? ` • ${album}` : ''}`}
            fadeWidth={40}
            intervalMs={scrollInterval}
          />
        </div>

        <div className="nowplaying__progress">
          <div className="nowplaying__bar" aria-hidden={!showProgress}>
            <div
              className="nowplaying__barFill"
              style={{ width: showProgress ? `${progressPct}%` : '0%' }}
            />
          </div>
          <div className="nowplaying__time">
            <span>{leftTime}</span>
            <span>{rightTime}</span>
          </div>
        </div>
      </div>

      <div className="nowplaying__controls">
        {isPlaying ? (
          <button className="nowplaying__btn nowplaying__btn--accent" onClick={pause} aria-label="Pause">⏸</button>
        ) : (
          <button className="nowplaying__btn nowplaying__btn--accent" onClick={play} aria-label="Play">▶</button>
        )}
        <button className="nowplaying__btn" onClick={quickMute} aria-label="Mute">🔇</button>
        {/* Volume percent display (unchanged) */}
        <div className="nowplaying__vol">{currentVolume}%</div>
      </div>
    </div>
  );
};

export default NowPlaying;
