'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Avis {
  id: string; note: number; commentaire?: string | null;
  reponseGerant?: string | null; statut: string; createdAt: string;
  client?: { nom: string | null; telephone: string | null } | null;
}

const etoiles = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function AvisPage() {
  const qc = useQueryClient();
  const [sansReponse, setSansReponse] = useState(false);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Avis[]>({
    queryKey: ['avis'],
    queryFn: async () => (await api.get('/avis')).data,
    refetchInterval: 60_000,
  });

  const liste = (data ?? []).filter((a) => !sansReponse || !a.reponseGerant);

  async function repondre(a: Avis) {
    const texte = reponses[a.id]?.trim();
    if (!texte) { setError('Réponse vide'); return; }
    setBusy(a.id); setError('');
    try {
      await api.patch(`/avis/${a.id}/reponse`, { reponseGerant: texte });
      qc.invalidateQueries({ queryKey: ['avis'] });
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Réponse impossible');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Avis clients</h1>
          <p className="text-xs text-neutral-400">
            Notes et commentaires — vos réponses sont publiques.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sansReponse}
            onChange={(e) => setSansReponse(e.target.checked)} />
          Sans réponse uniquement
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-neutral-400">Chargement…</p>}
      {!isLoading && liste.length === 0 && (
        <p className="text-neutral-400">Aucun avis{sansReponse ? ' en attente de réponse' : ''}.</p>
      )}

      <div className="space-y-3">
        {liste.map((a) => (
          <article key={a.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-amber-500">{etoiles(a.note)}</span>
                <span className="ml-2 text-sm font-medium">
                  {a.client?.nom || a.client?.telephone || 'Client'}
                </span>
                <span className="ml-2 text-xs text-neutral-400">
                  {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
              {a.statut !== 'publie' && (
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs dark:bg-neutral-800">
                  {a.statut}
                </span>
              )}
            </div>
            {a.commentaire && (
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{a.commentaire}</p>
            )}
            {a.reponseGerant ? (
              <div className="mt-3 rounded-lg bg-teal-50 p-3 text-sm dark:bg-teal-950/40">
                <span className="text-xs font-semibold uppercase text-teal-700 dark:text-teal-300">
                  Réponse de l'établissement
                </span>
                <p className="mt-1">{a.reponseGerant}</p>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  value={reponses[a.id] ?? ''}
                  onChange={(e) => setReponses({ ...reponses, [a.id]: e.target.value })}
                  placeholder="Votre réponse publique…"
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <button onClick={() => repondre(a)} disabled={busy === a.id}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy === a.id ? '…' : 'Répondre'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
