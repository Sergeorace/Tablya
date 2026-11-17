'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Télécharge un export CSV authentifié (Bearer JWT via axios). */
async function download(path: string, filename: string) {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Dashboard {
  ca: { brut_centimes: string; net_etablissement_centimes: string; transactions_reussies: number };
  commandes: { panier_moyen_centimes: string; par_statut: Record<string, { count: number; total: string }> };
  occupation: { places_total: number; places_occupees: number; taux: number };
  top_produits: { produit_id: string; nom: string; quantite: number; montant_centimes: string }[];
  reservations: Record<string, number>;
  alertes: { avis_non_repondus: number; retards_aujourdhui: number };
}

const xof = (centimes: string | number) =>
  `${Number(BigInt(centimes)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function DashboardPage() {
  const now = new Date();
  const [debut, setDebut] = useState(isoDate(new Date(now.getTime() - 30 * 86400_000)));
  const [fin, setFin] = useState(isoDate(now));
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: ['dashboard', debut, fin],
    queryFn: async () => (await api.get('/pilotage/dashboard', { params: { debut, fin } })).data,
  });

  const exportCsv = async (type: 'commandes' | 'transactions') => {
    setExportBusy(type);
    try {
      await download(
        `/pilotage/rapports/${type}?debut=${debut}&fin=${fin}&format=csv`,
        `${type}-${debut}_${fin}.csv`,
      );
    } catch {
      alert('Export impossible');
    } finally {
      setExportBusy(null);
    }
  };

  if (isLoading) return <p className="text-neutral-400">Chargement…</p>;
  if (error || !data) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        Impossible de charger le pilotage (permission <code>rapport.exporter</code> requise ?).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Pilotage</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <span className="text-neutral-400">→</span>
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <button onClick={() => exportCsv('commandes')} disabled={exportBusy !== null}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 disabled:opacity-50">
            {exportBusy === 'commandes' ? '…' : 'CSV commandes'}
          </button>
          <button onClick={() => exportCsv('transactions')} disabled={exportBusy !== null}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 disabled:opacity-50">
            {exportBusy === 'transactions' ? '…' : 'CSV transactions'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card label="CA brut (30 j)" value={xof(data.ca.brut_centimes)} hint={`${data.ca.transactions_reussies} transactions`} />
        <Card label="Net établissement" value={xof(data.ca.net_etablissement_centimes)} />
        <Card label="Panier moyen" value={xof(data.commandes.panier_moyen_centimes)} />
        <Card
          label="Occupation"
          value={`${Math.round(data.occupation.taux * 100)} %`}
          hint={`${data.occupation.places_occupees}/${data.occupation.places_total} places`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="font-semibold">Top produits</h2>
          <ul className="mt-3 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {data.top_produits.length === 0 && <li className="py-2 text-neutral-400">Aucune donnée</li>}
            {data.top_produits.map((p) => (
              <li key={p.produit_id} className="flex justify-between py-2">
                <span>{p.nom}</span>
                <span className="text-neutral-500">×{p.quantite} · {xof(p.montant_centimes)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="font-semibold">Alertes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between">
              <span>Avis sans réponse</span>
              <span className="font-semibold">{data.alertes.avis_non_repondus}</span>
            </li>
            <li className="flex justify-between">
              <span>Retards aujourd'hui</span>
              <span className="font-semibold">{data.alertes.retards_aujourdhui}</span>
            </li>
            {Object.entries(data.reservations).map(([s, n]) => (
              <li key={s} className="flex justify-between">
                <span>Réservations {s}</span>
                <span className="font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
