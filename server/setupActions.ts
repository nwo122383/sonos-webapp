// server/setupActions.ts
//
// Decoupled volume vs. favorites/playback (kept).
// Adds: Mute control + Transport state readback.
// - Volume: RenderingControl SetRelativeVolume / SetVolume / GetVolume
// - Mute:   RenderingControl SetMute / GetMute
// - State:  AVTransport GetTransportInfo (PLAYING/PAUSED_PLAYBACK/STOPPED)
// - After play/pause we read back and emit 'transportState'.
//
// Volume targets are ONLY payload.speakerUUIDs or volumeSelection (never favorites/playback).
// Favorites/playback unchanged (selectSpeakers/selectPlaybackSpeakers/playFavorite).
//
// NOTE: We prefer existing sonos.* for play/pause/next/prev; for state/mute/volume we use SOAP.

import { DeskThing } from './initializer';
import sonos from './sonos';
import type { SocketData } from '@deskthing/types';

const RC_URN = 'urn:schemas-upnp-org:service:RenderingControl:1';
const AVT_URN = 'urn:schemas-upnp-org:service:AVTransport:1';

// Independent volume selection (decoupled)
let volumeSelection: string[] = [];

function buildSoapEnvelope(urn: string, action: string, innerXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:${action} xmlns:u="${urn}">
      ${innerXml}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

async function postSoap(ip: string, urn: string, action: string, bodyXML: string): Promise<string> {
  const service =
    urn === RC_URN ? 'RenderingControl' :
    urn === AVT_URN ? 'AVTransport' :
    '';
  const url = `http://${ip}:1400/MediaRenderer/${service}/Control`;

  const envelope = buildSoapEnvelope(urn, action, bodyXML);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPAction': `"${urn}#${action}"`,
      'Connection': 'close',
    },
    body: envelope,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`[SOAP ${service}.${action}] ${res.status} ${res.statusText} ${text}`);
  }
  return text;
}

// ---------- Volume ----------
async function setRelativeVolume(ip: string, delta: number): Promise<void> {
  const body = `<InstanceID>0</InstanceID><Channel>Master</Channel><Adjustment>${Number(delta)}</Adjustment>`;
  await postSoap(ip, RC_URN, 'SetRelativeVolume', body);
}

async function setAbsoluteVolume(ip: string, volume: number): Promise<void> {
  const v = Math.max(0, Math.min(100, Math.round(Number(volume))));
  const body = `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${v}</DesiredVolume>`;
  await postSoap(ip, RC_URN, 'SetVolume', body);
}

async function getAbsoluteVolume(ip: string): Promise<number> {
  const body = `<InstanceID>0</InstanceID><Channel>Master</Channel>`;
  const xml = await postSoap(ip, RC_URN, 'GetVolume', body);
  const m = xml.match(/<CurrentVolume>(\d+)<\/CurrentVolume>/i);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) throw new Error('[GetVolume] parse failed');
  return Math.max(0, Math.min(100, n));
}

function resolveVolumeTargets(payload: any): string[] {
  const explicit = Array.isArray(payload?.speakerUUIDs) ? payload.speakerUUIDs.filter(Boolean) : [];
  if (explicit.length) return explicit;
  return Array.isArray(volumeSelection) ? volumeSelection.slice() : [];
}

// ---------- Mute ----------
async function setMute(ip: string, on: boolean): Promise<void> {
  const body = `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>${on ? 1 : 0}</DesiredMute>`;
  await postSoap(ip, RC_URN, 'SetMute', body);
}

async function getMute(ip: string): Promise<boolean> {
  const body = `<InstanceID>0</InstanceID><Channel>Master</Channel>`;
  const xml = await postSoap(ip, RC_URN, 'GetMute', body);
  const m = xml.match(/<CurrentMute>(\d+)<\/CurrentMute>/i);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) throw new Error('[GetMute] parse failed');
  return n === 1;
}

// ---------- Transport State ----------
async function getTransportState(ip: string): Promise<string> {
  const body = `<InstanceID>0</InstanceID>`;
  const xml = await postSoap(ip, AVT_URN, 'GetTransportInfo', body);
  // <CurrentTransportState>PLAYING|PAUSED_PLAYBACK|STOPPED</CurrentTransportState>
  const m = xml.match(/<CurrentTransportState>([^<]+)<\/CurrentTransportState>/i);
  const state = (m ? m[1] : 'UNKNOWN').trim();
  return state;
}

// Choose a single "playback context" device IP to read state/mute from:
// priority: selectedPlaybackSpeakers[0] -> selectedSpeakerUUIDs[0] -> sonos.deviceIP
async function getAnyPlaybackIP(): Promise<string | null> {
  const playback = (sonos as any).selectedPlaybackSpeakers;
  const favorites = (sonos as any).selectedSpeakerUUIDs;

  const pick = async (uuids: string[] | undefined): Promise<string | null> => {
    if (!Array.isArray(uuids) || uuids.length === 0) return null;
    const ip = await (sonos as any).getSpeakerIPByUUID?.(uuids[0]);
    return ip || null;
  };

  let ip = await pick(playback);
  if (ip) return ip;
  ip = await pick(favorites);
  if (ip) return ip;
  return (sonos as any).deviceIP || null;
}

export const setupActions = () => {
  console.log('[Sonos] Registering DeskThing listeners (volume/mute/state).');

  // ---------- SET ----------
  DeskThing.on('set', async (socketData: SocketData) => {
    try {
      const { request, payload } = socketData;
      console.log(`[Sonos] Received SET: ${JSON.stringify(socketData)}`);

      switch (request) {
        // ===== Volume selection (decoupled) =====
        case 'selectVolumeSpeakers': {
          volumeSelection = Array.isArray(payload?.uuids) ? payload.uuids.filter(Boolean) : [];
          DeskThing.send({
            app: 'sonos-webapp',
            type: 'selectedVolumeSpeakers',
            payload: { uuids: volumeSelection },
          });
          break;
        }

        // ===== Absolute volume =====
        case 'volumeChange': {
          if (typeof payload?.volume !== 'number') {
            console.warn('[volumeChange] Missing numeric volume.');
            break;
          }
          const targets = resolveVolumeTargets(payload);
          if (!targets.length) {
            console.warn('[volumeChange] No volume speakers selected.');
            break;
          }
          for (const uuid of targets) {
            try {
              const ip = await (sonos as any).getSpeakerIPByUUID?.(uuid);
              if (!ip) { console.warn('[volumeChange] No IP for', uuid); continue; }
              await setAbsoluteVolume(ip, payload.volume);
              try {
                const vol = await getAbsoluteVolume(ip);
                DeskThing.send({ app: 'sonos-webapp', type: 'volume', payload: { uuid, volume: vol } });
              } catch {
                DeskThing.send({ app: 'sonos-webapp', type: 'volume', payload: { uuid, volume: payload.volume } });
              }
            } catch (e) {
              console.error('[volumeChange] failed for', uuid, e);
            }
          }
          break;
        }

        // ===== Relative volume =====
        case 'adjustVolume': {
          const delta = Number(payload?.delta ?? 0);
          const targets = resolveVolumeTargets(payload);
          if (!delta || !targets.length) {
            console.warn('[adjustVolume] No volume speakers selected.');
            break;
          }
          for (const uuid of targets) {
            try {
              const ip = await (sonos as any).getSpeakerIPByUUID?.(uuid);
              if (!ip) { console.warn('[adjustVolume] No IP for', uuid); continue; }
              await setRelativeVolume(ip, delta);
              try {
                const vol = await getAbsoluteVolume(ip);
                DeskThing.send({ app: 'sonos-webapp', type: 'volume', payload: { uuid, volume: vol } });
              } catch (e) {
                console.warn('[adjustVolume] readback failed for', uuid, e);
              }
            } catch (e) {
              console.error('[adjustVolume] failed for', uuid, e);
            }
          }
          break;
        }

        // ===== Mute (on/off/toggle) for playback context (apply to first playback target) =====
        case 'mute': {
          const raw = typeof payload === 'string' ? payload : payload?.state;
          const mode = (raw === 'on' || raw === 'off' || raw === 'toggle') ? raw : 'toggle';
          const ip = await getAnyPlaybackIP();
          if (!ip) { console.warn('[mute] No playback IP.'); break; }

          try {
            const current = await getMute(ip);
            const next = mode === 'toggle' ? !current : (mode === 'on');
            await setMute(ip, next);
            DeskThing.send({ app: 'sonos-webapp', type: 'mute', payload: { muted: next } });
          } catch (e) {
            console.error('[mute] failed:', e);
          }
          break;
        }

        // ===== Playback selection (unchanged) =====
        case 'selectPlaybackSpeakers': {
          if (Array.isArray(payload?.uuids)) {
            await sonos.selectPlaybackSpeakers(payload.uuids);
            DeskThing.send({
              app: 'sonos-webapp',
              type: 'selectedPlaybackSpeakers',
              payload: { uuids: (sonos as any).selectedPlaybackSpeakers },
            });
            await (sonos as any).getZoneGroupState?.().catch(() => {});
          }
          break;
        }

        // ===== Favorites selection (unchanged) =====
        case 'selectSpeakers': {
          if (Array.isArray(payload?.uuids)) {
            await sonos.selectSpeakers(payload.uuids);
            DeskThing.send({
              app: 'sonos-webapp',
              type: 'selectedSpeakers',
              payload: { uuids: (sonos as any).selectedSpeakerUUIDs },
            });
          }
          break;
        }

        // ===== Play favorite (unchanged) =====
        case 'playFavorite': {
          if (payload?.uri) {
            const uuids =
              payload.speakerUUIDs ||
              (sonos as any).selectedPlaybackSpeakers ||
              (sonos as any).selectedSpeakerUUIDs ||
              [];
            if (uuids.length > 0) {
              await sonos.playFavoriteOnSpeakers(payload.uri, uuids);
            } else {
              console.warn('[playFavorite] No speakers selected.');
            }
          }
          break;
        }

        // ===== Transport controls (play/pause/next/prev) + readback state =====
        case 'pause': {
          if ((sonos as any).deviceIP) await (sonos as any).pause((sonos as any).deviceIP);
          const ip = await getAnyPlaybackIP();
          if (ip) {
            try {
              const state = await getTransportState(ip);
              DeskThing.send({ app: 'sonos-webapp', type: 'transportState', payload: { state } });
            } catch {}
          }
          break;
        }
        case 'play': {
          if ((sonos as any).deviceIP) await (sonos as any).play((sonos as any).deviceIP);
          const ip = await getAnyPlaybackIP();
          if (ip) {
            try {
              const state = await getTransportState(ip);
              DeskThing.send({ app: 'sonos-webapp', type: 'transportState', payload: { state } });
            } catch {}
          }
          break;
        }
        case 'next':
        case 'skip': {
          if ((sonos as any).deviceIP) await (sonos as any).next((sonos as any).deviceIP);
          break;
        }
        case 'previous': {
          if ((sonos as any).deviceIP) await (sonos as any).previous((sonos as any).deviceIP);
          break;
        }

        // ===== Shuffle / Repeat (unchanged) =====
        case 'shuffle': {
          const raw = typeof payload === 'string' ? payload : payload?.state;
          const state = (raw === 'on' || raw === 'off' || raw === 'toggle' ? raw : 'toggle') as
            'on' | 'off' | 'toggle';
          try { await (sonos as any).shuffle?.(state); }
          catch (e) { console.error('[shuffle] failed:', e); }
          break;
        }
        case 'repeat': {
          const raw = typeof payload === 'string' ? payload : payload?.state;
          const state = (raw === 'all' || raw === 'one' || raw === 'off' ? raw : 'off') as
            'off' | 'all' | 'one';
          try { await (sonos as any).repeat?.(state); }
          catch (e) { console.error('[repeat] failed:', e); }
          break;
        }
      }
    } catch (e) {
      console.error('[setupActions] Uncaught error:', (e as any)?.message || e);
    }
  });

  // ---------- GET ----------
  DeskThing.on('get', async (socketData: SocketData) => {
    const { request, payload } = socketData || {};
    switch (request) {
      case 'selectedVolumeSpeakers': {
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'selectedVolumeSpeakers',
          payload: { uuids: volumeSelection },
        });
        break;
      }
      case 'selectedPlaybackSpeakers': {
        DeskThing.send({
          app: 'sonos-webapp',
          type: 'selectedPlaybackSpeakers',
          payload: { uuids: (sonos as any).selectedPlaybackSpeakers || [] },
        });
        break;
      }
      case 'volume': {
        const targets = Array.isArray(payload?.speakerUUIDs) && payload.speakerUUIDs.length
          ? payload.speakerUUIDs
          : (Array.isArray(volumeSelection) ? volumeSelection : []);
        for (const uuid of targets) {
          try {
            const ip = await (sonos as any).getSpeakerIPByUUID?.(uuid);
            if (!ip) { console.warn('[GET volume] No IP for', uuid); continue; }
            const vol = await getAbsoluteVolume(ip);
            DeskThing.send({ app: 'sonos-webapp', type: 'volume', payload: { uuid, volume: vol } });
          } catch (e) {
            console.error('[GET volume] failed for', uuid, e);
          }
        }
        break;
      }
      case 'mute': {
        const ip = await getAnyPlaybackIP();
        if (!ip) { console.warn('[GET mute] No playback IP.'); break; }
        try {
          const muted = await getMute(ip);
          DeskThing.send({ app: 'sonos-webapp', type: 'mute', payload: { muted } });
        } catch (e) {
          console.error('[GET mute] failed:', e);
        }
        break;
      }
      case 'transportState': {
        const ip = await getAnyPlaybackIP();
        if (!ip) { console.warn('[GET transportState] No playback IP.'); break; }
        try {
          const state = await getTransportState(ip);
          DeskThing.send({ app: 'sonos-webapp', type: 'transportState', payload: { state } });
        } catch (e) {
          console.error('[GET transportState] failed:', e);
        }
        break;
      }
      default:
        break;
    }
  });
};
