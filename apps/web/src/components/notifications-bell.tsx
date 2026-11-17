'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Notification {
  id: string; titre: string; corps: string; type: string;
  lueAt: string | null; createdAt: string;
}

/** Cloche de notifications staff — polling 30 s (socket.io non requis). */
export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: nonLues = [] } = useQuery<Notification[]>({
    queryKey: ['notifications-non-lues'],
    queryFn: async () => (await api.get('/notifications', { params: { non_lues: '1' } })).data,
    refetchInterval: 30_000,
  });
  const { data: recentes = [] } = useQuery<Notification[]>({
    queryKey: ['notifications-recentes'],
    enabled: open,
    queryFn: async () => (await api.get('/notifications')).data,
  });

  const count = nonLues.length;

  async function toutLire() {
    await api.post('/notifications/lire-tout');
    qc.invalidateQueries({ queryKey: ['notifications-non-lues'] });
    qc.invalidateQueries({ queryKey: ['notifications-recentes'] });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-label={`Notifications${count ? ` (${count} non lues)` : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button onClick={toutLire} className="text-xs text-teal-700 hover:underline dark:text-teal-300">
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {recentes.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-neutral-400">Aucune notification</p>
            )}
            {recentes.map((n) => (
              <div key={n.id}
                className={`border-b border-neutral-50 px-4 py-3 last:border-0 dark:border-neutral-800/50 ${n.lueAt ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{n.titre}</p>
                  {!n.lueAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" />}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">{n.corps}</p>
                <p className="mt-1 text-[10px] text-neutral-400">
                  {new Date(n.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
