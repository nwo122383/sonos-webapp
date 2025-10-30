// src/components/ToastCenter.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { DeskThing } from '@deskthing/client';
import type { SocketData } from '@deskthing/types';
import './Toast.css';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  ttlMs: number;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

type Props = {
  /** Optional: initial toasts */
  initial?: ToastItem[];
  /** Default time to live (ms) */
  defaultTtlMs?: number;
};

const ToastCenter: React.FC<Props> = ({ initial = [], defaultTtlMs = 3000 }) => {
  const [toasts, setToasts] = useState<ToastItem[]>(initial);

  useEffect(() => {
    const off = DeskThing.on('toast', (data: SocketData) => {
      if (data.type !== 'toast') return;
      const payload = (data.payload || {}) as Partial<ToastItem> & { kind?: ToastKind; message?: string; ttlMs?: number };
      const kind: ToastKind = (payload.kind as ToastKind) || 'info';
      const message = payload.message || '';
      if (!message) return;
      const ttl = typeof payload.ttlMs === 'number' ? payload.ttlMs : defaultTtlMs;

      const item: ToastItem = { id: makeId(), kind, message, ttlMs: ttl };
      setToasts((prev) => [...prev, item]);

      // schedule removal
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, ttl);
    });
    return () => off();
  }, [defaultTtlMs]);

  const mapped = useMemo(() => toasts.slice(-6), [toasts]); // cap stack

  return (
    <div className="toast-root" aria-live="polite" aria-atomic="true">
      {mapped.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status">
          <span className="toast__dot" />
          <div className="toast__msg">{t.message}</div>
          <button
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastCenter;