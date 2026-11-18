'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AuditLog {
  id: string; action: string; entiteType: string; entiteId: string;
  motif: string | null; ip: string | null; requestId: string | null;
  createdAt: string;
  utilisateur: { email: string | null; telephone: string | null } | null;
}

const input =
  'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export default function JournalPage() {
  const [page, setPage] = useState(1);
  const [filtres, setFiltres] = useState({ action: '', entiteType: '', dateDebut: '', dateFin: '' });
  const [applied, setApplied] = useState(filtres);

  const { data, isLoading } = useQuery<{ items: AuditLog[]; total: number; pages: number; page: number }>({
    queryKey: ['audit', page, applied],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (applied.action) params.action = applied.action;
      if (applied.entiteType) params.entiteType = applied.entiteType;
      if (applied.dateDebut) params.dateDebut = applied.dateDebut;
      if (applied.dateFin) params.dateFin = `${applied.dateFin}T23:59:59`;
      return (await api.get('/audit-logs', { params })).data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Journal d'audit</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filtres); }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="text-xs">Action
          <input className={`${input} mt-1 block`} placeholder="commande.annuler"
            value={filtres.action} onChange={(e) => setFiltres({ ...filtres, action: e.target.value })} />
        </label>
        <label className="text-xs">Entité
          <input className={`${input} mt-1 block`} placeholder="commande"
            value={filtres.entiteType} onChange={(e) => setFiltres({ ...filtres, entiteType: e.target.value })} />
        </label>
        <label className="text-xs">Du
          <input type="date" className={`${input} mt-1 block`} value={filtres.dateDebut}
            onChange={(e) => setFiltres({ ...filtres, dateDebut: e.target.value })} />
        </label>
        <label className="text-xs">Au
          <input type="date" className={`${input} mt-1 block`} value={filtres.dateFin}
            onChange={(e) => setFiltres({ ...filtres, dateFin: e.target.value })} />
        </label>
        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white">
          Filtrer
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entité</th>
              <th className="px-4 py-2">Utilisateur</th>
              <th className="px-4 py-2">Motif</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">Chargement…</td></tr>}
            {(data?.items ?? []).map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {new Date(l.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                <td className="px-4 py-2 text-xs">{l.entiteType} · {l.entiteId.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs">{l.utilisateur?.email ?? l.utilisateur?.telephone ?? '—'}</td>
                <td className="max-w-56 truncate px-4 py-2 text-xs">{l.motif ?? '—'}</td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">Aucune entrée</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40 dark:border-neutral-700">
            ← Préc.
          </button>
          <span>Page {data.page} / {data.pages} — {data.total} entrées</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}
            className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40 dark:border-neutral-700">
            Suiv. →
          </button>
        </div>
      )}
    </div>
  );
}
