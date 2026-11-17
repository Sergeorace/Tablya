'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Transaction {
  id: string; statut: string; fournisseur: string; type: string;
  montantCentimes: string; devise: string; createdAt: string;
  referenceExterne?: string | null; commandeId?: string | null;
  fraisFournisseurCentimes?: string | null; netEtablissementCentimes?: string | null;
  commissionPlateformeCentimes?: string | null;
}

const STATUTS = ['', 'initiee', 'en_attente', 'reussie', 'echouee', 'remboursee', 'partiellement_payee'];
const COULEURS: Record<string, string> = {
  initiee: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800',
  en_attente: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  reussie: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  echouee: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  remboursee: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  partiellement_payee: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

const xof = (c?: string | null) =>
  c == null ? '—' : `${Number(BigInt(c)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

export default function PaiementsPage() {
  const [statut, setStatut] = useState('');
  const { data, isLoading, error, refetch } = useQuery<Transaction[]>({
    queryKey: ['transactions', statut],
    queryFn: async () =>
      (await api.get('/transactions', { params: statut ? { statut } : {} })).data,
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Paiements</h1>
          <p className="text-xs text-neutral-400">
            Transactions FedaPay / CinetPay / espèces — confirmation par webhook.
          </p>
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {STATUTS.map((s) => <option key={s} value={s}>{s || 'Tous'}</option>)}
        </select>
      </div>
      {isLoading && <p className="text-neutral-400">Chargement…</p>}
      {error && <p className="text-red-600">Erreur de chargement des transactions.</p>}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Fournisseur</th>
              <th className="px-4 py-2">Montant</th>
              <th className="px-4 py-2">Net étab.</th>
              <th className="px-4 py-2">Réf. externe</th>
              <th className="px-4 py-2">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {(data ?? []).map((t) => (
              <tr key={t.id} className="bg-white dark:bg-neutral-900">
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-2 font-medium">{t.fournisseur}</td>
                <td className="px-4 py-2">{xof(t.montantCentimes)}</td>
                <td className="px-4 py-2">{xof(t.netEtablissementCentimes)}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.referenceExterne ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS[t.statut] ?? ''}`}>
                    {t.statut}
                  </span>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">Aucune transaction.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={() => refetch()} className="text-xs text-neutral-400 underline">
        Actualiser
      </button>
    </div>
  );
}
