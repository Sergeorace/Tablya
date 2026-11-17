'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Bulletin {
  id: string; statut: string; periodeAnnee: number; periodeMois: number;
  brutCentimes: string; netCentimes: string; cotisationsCentimes: string;
  impotsCentimes: string; primesCentimes: string; retenuesCentimes: string;
  heuresSupMinutes: number; validatedBy: string | null; approvedBy: string | null;
  employe: { id: string; nom: string; prenom: string; poste: string };
}

const xof = (c: string) => `${Number(BigInt(c)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
const STATUT_C: Record<string, string> = {
  brouillon: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  valide: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  approuve: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  paye: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  annule: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export default function PaiePage() {
  const qc = useQueryClient();
  const now = new Date();
  const [periode, setPeriode] = useState({ annee: now.getFullYear(), mois: now.getMonth() + 1 });
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Bulletin[]>({
    queryKey: ['bulletins', periode],
    queryFn: async () =>
      (await api.get('/paie/bulletins', { params: periode })).data,
  });

  async function action(id: string, path: string, body?: unknown) {
    setBusy(id + path);
    try {
      await api.post(`/paie/bulletins/${id}${path}`, body ?? {});
      qc.invalidateQueries({ queryKey: ['bulletins'] });
    } catch {
      alert('Action refusée (permissions ou transition invalide).');
    } finally {
      setBusy(null);
    }
  }

  async function generer() {
    setBusy('generer');
    try {
      await api.post('/paie/bulletins/generer', periode);
      qc.invalidateQueries({ queryKey: ['bulletins'] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Paie</h1>
        <div className="flex items-center gap-2">
          <input
            type="number" value={periode.annee} min={2000} max={2100}
            onChange={(e) => setPeriode({ ...periode, annee: Number(e.target.value) })}
            className="w-24 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={periode.mois}
            onChange={(e) => setPeriode({ ...periode, mois: Number(e.target.value) })}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          <button
            onClick={generer}
            disabled={busy === 'generer'}
            className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            Générer les bulletins
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-4 py-3">Employé</th><th className="px-4 py-3">Brut</th>
              <th className="px-4 py-3">Cotis.</th><th className="px-4 py-3">Impôt</th>
              <th className="px-4 py-3">Net</th><th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">Chargement…</td></tr>}
            {(data ?? []).map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-medium">{b.employe.prenom} {b.employe.nom}</td>
                <td className="px-4 py-3">{xof(b.brutCentimes)}</td>
                <td className="px-4 py-3">{xof(b.cotisationsCentimes)}</td>
                <td className="px-4 py-3">{xof(b.impotsCentimes)}</td>
                <td className="px-4 py-3 font-semibold">{xof(b.netCentimes)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_C[b.statut]}`}>
                    {b.statut}
                  </span>
                </td>
                <td className="space-x-1 px-4 py-3">
                  {b.statut === 'brouillon' && (
                    <button disabled={!!busy} onClick={() => action(b.id, '/valider')}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white">Valider</button>
                  )}
                  {b.statut === 'valide' && (
                    <button disabled={!!busy} onClick={() => action(b.id, '/approuver')}
                      className="rounded bg-teal-700 px-2 py-1 text-xs text-white">Approuver</button>
                  )}
                  {b.statut === 'approuve' && (
                    <button disabled={!!busy} onClick={() => action(b.id, '/payer', {})}
                      className="rounded bg-green-700 px-2 py-1 text-xs text-white">Payer</button>
                  )}
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                Aucun bulletin — cliquez « Générer ».
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400">
        La validation à deux niveaux exige deux utilisateurs distincts (paie.preparer puis paie.approuver).
      </p>
    </div>
  );
}
