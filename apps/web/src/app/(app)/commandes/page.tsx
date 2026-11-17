'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Ligne { id: string; statut: string; posteCible: string; quantite: number }
interface Commande {
  id: string; statut: string; type: string; totalCentimes: string; createdAt: string;
  place?: { numero: string; statut: string } | null;
  client?: { nom: string | null; telephone: string | null } | null;
  lignes: Ligne[];
}

const STATUTS = ['', 'recue', 'en_preparation', 'prete', 'servie', 'cloturee', 'annulee'];
const COULEURS: Record<string, string> = {
  recue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  en_preparation: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  prete: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  servie: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  cloturee: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  annulee: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const xof = (c: string) => `${Number(BigInt(c)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

export default function CommandesPage() {
  const [statut, setStatut] = useState('');
  const { data, isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ['commandes', statut],
    queryFn: async () =>
      (await api.get('/commandes', { params: statut ? { statut } : {} })).data,
    refetchInterval: 10_000,
  });

  async function avancer(c: Commande) {
    const suite: Record<string, string> = {
      recue: 'en_preparation', en_preparation: 'prete', prete: 'servie',
    };
    const next = suite[c.statut];
    if (!next) return;
    await api.patch(`/commandes/${c.id}/statut`, { statut: next });
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Commandes</h1>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {STATUTS.map((s) => <option key={s} value={s}>{s || 'Tous'}</option>)}
        </select>
      </div>
      {isLoading && <p className="text-neutral-400">Chargement…</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((c) => (
          <article key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">#{c.id.slice(0, 8)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS[c.statut]}`}>
                {c.statut}
              </span>
            </div>
            <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {c.place ? `Place ${c.place.numero} · ` : ''}{c.type} · {new Date(c.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="mt-1 text-sm text-neutral-500">
              {c.client?.nom ?? c.client?.telephone ?? 'Client anonyme'} · {c.lignes.length} ligne(s)
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-semibold">{xof(c.totalCentimes)}</span>
              {['recue', 'en_preparation', 'prete'].includes(c.statut) && (
                <button
                  onClick={() => avancer(c)}
                  className="rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  {c.statut === 'recue' ? '→ Préparer' : c.statut === 'en_preparation' ? '→ Prête' : '→ Servie'}
                </button>
              )}
            </div>
          </article>
        ))}
        {data?.length === 0 && <p className="text-neutral-400">Aucune commande.</p>}
      </div>
    </div>
  );
}
