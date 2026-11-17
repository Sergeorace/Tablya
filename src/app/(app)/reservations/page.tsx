'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Reservation {
  id: string; creneauDebut: string; creneauFin: string; nbPersonnes: number;
  statut: string; createdAt: string;
  client?: { nom: string | null; telephone: string | null } | null;
  place?: { numero: string } | null;
}

const STATUTS = ['', 'en_attente', 'confirmee', 'honoree', 'annulee', 'no_show'];
const COULEURS: Record<string, string> = {
  en_attente: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  confirmee: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  honoree: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  annulee: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  no_show: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800',
};

// Actions staff autorisées par l'API (TRANSITIONS côté serveur).
const ACTIONS: Record<string, { statut: string; label: string; danger?: boolean }[]> = {
  en_attente: [
    { statut: 'confirmee', label: 'Confirmer' },
    { statut: 'annulee', label: 'Annuler', danger: true },
  ],
  confirmee: [
    { statut: 'honoree', label: 'Honorée' },
    { statut: 'no_show', label: 'No-show' },
    { statut: 'annulee', label: 'Annuler', danger: true },
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

export default function ReservationsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [statut, setStatut] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading, refetch } = useQuery<Reservation[]>({
    queryKey: ['reservations', date, statut],
    queryFn: async () =>
      (await api.get('/reservations', {
        params: { date, ...(statut ? { statut } : {}) },
      })).data,
    refetchInterval: 30_000,
  });

  async function transition(r: Reservation, s: string) {
    let motif: string | undefined;
    if (['annulee', 'no_show'].includes(s)) {
      const saisi = prompt(`Motif (${s === 'annulee' ? 'annulation' : 'no-show'}) :`);
      if (saisi === null) return; // annulé par l'utilisateur
      motif = saisi || undefined;
    }
    setBusy(r.id); setError('');
    try {
      await api.patch(`/reservations/${r.id}/statut`, { statut: s, motif });
      qc.invalidateQueries({ queryKey: ['reservations'] });
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Transition impossible');
    } finally {
      setBusy(null);
    }
  }

  const parHeure = (data ?? []).reduce<Record<string, Reservation[]>>((acc, r) => {
    const h = new Date(r.creneauDebut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    (acc[h] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Réservations</h1>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select value={statut} onChange={(e) => setStatut(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            {STATUTS.map((s) => <option key={s} value={s}>{s || 'Tous statuts'}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-neutral-400">Chargement…</p>}

      {Object.keys(parHeure).length === 0 && !isLoading && (
        <p className="text-neutral-400">Aucune réservation pour cette date.</p>
      )}

      {Object.entries(parHeure).map(([heure, liste]) => (
        <section key={heure}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {heure} — {liste.length} réservation{liste.length > 1 ? 's' : ''}
          </h2>
          <div className="space-y-2">
            {liste.map((r) => (
              <article key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {r.client?.nom || r.client?.telephone || 'Client'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS[r.statut]}`}>
                      {r.statut.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-neutral-500">
                    {r.nbPersonnes} pers.
                    {r.place ? ` · Table ${r.place.numero}` : ''}
                    {r.client?.telephone ? ` · ${r.client.telephone}` : ''}
                    {' · '}{new Date(r.creneauFin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} fin
                  </div>
                </div>
                <div className="flex gap-2">
                  {(ACTIONS[r.statut] ?? []).map((a) => (
                    <button key={a.statut}
                      onClick={() => transition(r, a.statut)}
                      disabled={busy === r.id}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        a.danger
                          ? 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300'
                          : 'bg-teal-700 text-white hover:bg-teal-800'
                      }`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <button onClick={() => refetch()} className="text-xs text-neutral-400 underline">
        Actualiser
      </button>
    </div>
  );
}
