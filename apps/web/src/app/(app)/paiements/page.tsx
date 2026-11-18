'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface Reversement {
  id: string; montantCentimes: string; statut: string;
  destination: string; referenceExterne: string | null;
  executeAt: string | null; completedAt: string | null;
}

interface Portefeuille { soldeCentimes: string; devise: string }

const COULEURS_REV: Record<string, string> = {
  planifie: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  en_cours: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  complete: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  echoue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export default function PaiementsPage() {
  const qc = useQueryClient();
  const [statut, setStatut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery<Transaction[]>({
    queryKey: ['transactions', statut],
    queryFn: async () =>
      (await api.get('/transactions', { params: statut ? { statut } : {} })).data,
    refetchInterval: 15_000,
  });

  const { data: portefeuille } = useQuery<Portefeuille>({
    queryKey: ['portefeuille'],
    queryFn: async () => (await api.get('/portefeuille')).data,
    retry: false,
  });

  const { data: reversements, refetch: refetchRev } = useQuery<Reversement[]>({
    queryKey: ['reversements'],
    queryFn: async () => (await api.get('/reversements')).data,
    retry: false,
  });

  async function executer(id: string) {
    setError(null);
    const destination = window.prompt('Numéro mobile money du destinataire (ex. +22890000000) :');
    if (!destination?.trim()) return;
    try {
      await api.post(`/reversements/${id}/executer`, { destination: destination.trim() });
      refetchRev();
      qc.invalidateQueries({ queryKey: ['portefeuille'] });
    } catch {
      setError('Exécution impossible — vérifiez le numéro ou réessayez.');
    }
  }

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
      {error && <p className="text-sm text-red-600">{error}</p>}

      {portefeuille && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm dark:border-teal-900 dark:bg-teal-950">
          Solde portefeuille : <strong>{xof(portefeuille.soldeCentimes)}</strong>
        </div>
      )}

      {(reversements ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Reversements (J+1)</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2">Montant</th>
                  <th className="px-4 py-2">Exécution prévue</th>
                  <th className="px-4 py-2">Référence</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {reversements!.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-neutral-900">
                    <td className="px-4 py-2">{xof(r.montantCentimes)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.executeAt ? new Date(r.executeAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.referenceExterne ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEURS_REV[r.statut] ?? ''}`}>
                        {r.statut}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {r.statut === 'planifie' && (
                        <button onClick={() => executer(r.id)}
                          className="rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800">
                          Exécuter
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <button onClick={() => { refetch(); refetchRev(); }} className="text-xs text-neutral-400 underline">
        Actualiser
      </button>
    </div>
  );
}
