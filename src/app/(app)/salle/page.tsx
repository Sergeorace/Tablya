'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Ouvre une ressource protégée (SVG/HTML) via blob + object URL —
 *  le endpoint exige le Bearer JWT, un simple <a href> ne suffit pas. */
async function openProtected(path: string) {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Place {
  id: string; numero: string; statut: string; capacite: number; type: string;
  commandes?: { id: string; statut: string; totalCentimes: string }[];
}
interface Zone { id: string; nom: string; places: Place[] }

const STATUT_STYLES: Record<string, string> = {
  libre: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  occupee: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  reservee: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  addition: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  nettoyage: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  hors_service: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-900',
};

export default function SallePage() {
  const [qrBusy, setQrBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<{ zones: Zone[] }>({
    queryKey: ['salle-plan'],
    queryFn: async () => (await api.get('/salle/plan')).data,
    refetchInterval: 15_000,
  });

  const openQr = async (placeId: string) => {
    setQrBusy(placeId);
    try { await openProtected(`/places/${placeId}/qr.svg`); }
    catch { alert('QR indisponible'); }
    finally { setQrBusy(null); }
  };
  const printAll = async () => {
    setQrBusy('all');
    try { await openProtected('/salle/qr-print'); }
    catch { alert('Page d’impression indisponible'); }
    finally { setQrBusy(null); }
  };

  if (isLoading) return <p className="text-neutral-400">Chargement…</p>;
  if (error) return <p className="text-red-600">Erreur de chargement du plan de salle.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Plan de salle</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={printAll}
            disabled={qrBusy !== null}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {qrBusy === 'all' ? '…' : 'Imprimer les QR'}
          </button>
          <span className="text-xs text-neutral-400">Actualisation auto 15 s</span>
        </div>
      </div>
      {(data?.zones ?? []).map((zone) => (
        <section key={zone.id}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {zone.nom}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {zone.places.map((p) => {
              const cmd = p.commandes?.[0];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 ${STATUT_STYLES[p.statut] ?? 'bg-white dark:bg-neutral-900'}`}
                >
                  <div className="font-mono text-lg font-bold">{p.numero}</div>
                  <div className="text-xs opacity-80">{p.capacite} pers. · {p.type}</div>
                  <div className="mt-1 text-xs font-medium uppercase">{p.statut}</div>
                  {cmd && (
                    <div className="mt-1 truncate text-xs">
                      Cmd {cmd.statut} · {(Number(BigInt(cmd.totalCentimes)) / 100).toFixed(0)} F
                    </div>
                  )}
                  <button
                    onClick={() => openQr(p.id)}
                    disabled={qrBusy !== null}
                    className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    {qrBusy === p.id ? '…' : 'QR'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
