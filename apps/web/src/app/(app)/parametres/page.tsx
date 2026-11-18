'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Etablissement {
  id: string;
  slug: string;
  raisonSociale: string;
  rccm: string | null;
  nif: string | null;
  logoUrl: string | null;
  langues: string[];
  horaires: Record<string, unknown> | null;
  statut: string;
  abonnements: { plan: string; statut: string; montantCentimes: string; periode: string }[];
  _count: { places: number; produits: number; employes: number };
}

const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export default function ParametresPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ raisonSociale: '', rccm: '', nif: '', logoUrl: '', horaires: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: etab, isLoading } = useQuery<Etablissement>({
    queryKey: ['etablissement'],
    queryFn: async () => (await api.get('/etablissement')).data,
  });

  useEffect(() => {
    if (!etab) return;
    setForm({
      raisonSociale: etab.raisonSociale,
      rccm: etab.rccm ?? '',
      nif: etab.nif ?? '',
      logoUrl: etab.logoUrl ?? '',
      horaires: etab.horaires ? JSON.stringify(etab.horaires, null, 2) : '',
    });
  }, [etab]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      let horaires: Record<string, unknown> | undefined;
      if (form.horaires.trim()) {
        horaires = JSON.parse(form.horaires);
      }
      await api.patch('/etablissement', {
        raisonSociale: form.raisonSociale || undefined,
        rccm: form.rccm || undefined,
        nif: form.nif || undefined,
        logoUrl: form.logoUrl || undefined,
        horaires,
      });
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['etablissement'] });
    } catch {
      setError('Enregistrement impossible — vérifiez les champs (horaires = JSON valide).');
    }
  }

  const abo = etab?.abonnements?.[0];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Paramètres</h1>

      {isLoading && <p className="text-sm text-neutral-500">Chargement…</p>}

      {etab && (
        <>
          <section className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div><p className="text-xs text-neutral-500">Slug public</p><p className="font-mono text-sm">{etab.slug}</p></div>
            <div><p className="text-xs text-neutral-500">Statut</p><p className="text-sm">{etab.statut}</p></div>
            <div><p className="text-xs text-neutral-500">Abonnement</p>
              <p className="text-sm">{abo ? `${abo.plan} · ${abo.statut}` : '—'}</p>
            </div>
            <div><p className="text-xs text-neutral-500">Places</p><p className="text-sm">{etab._count.places}</p></div>
            <div><p className="text-xs text-neutral-500">Produits</p><p className="text-sm">{etab._count.produits}</p></div>
            <div><p className="text-xs text-neutral-500">Employés</p><p className="text-sm">{etab._count.employes}</p></div>
          </section>

          <form onSubmit={enregistrer} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="font-semibold">Fiche établissement</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Raison sociale
                <input className={`${input} mt-1`} value={form.raisonSociale}
                  onChange={(e) => setForm({ ...form, raisonSociale: e.target.value })} />
              </label>
              <label className="text-sm">RCCM
                <input className={`${input} mt-1`} value={form.rccm}
                  onChange={(e) => setForm({ ...form, rccm: e.target.value })} />
              </label>
              <label className="text-sm">NIF
                <input className={`${input} mt-1`} value={form.nif}
                  onChange={(e) => setForm({ ...form, nif: e.target.value })} />
              </label>
              <label className="text-sm">URL du logo
                <input className={`${input} mt-1`} value={form.logoUrl} placeholder="https://…"
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm">Horaires d'ouverture (JSON)
              <textarea className={`${input} mt-1 font-mono text-xs`} rows={5}
                placeholder='{"lun":"12:00-23:00","mar":"12:00-23:00"}'
                value={form.horaires}
                onChange={(e) => setForm({ ...form, horaires: e.target.value })} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-teal-700">Enregistré — tracé dans le journal d'audit.</p>}
            <button type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              Enregistrer
            </button>
          </form>
        </>
      )}
    </div>
  );
}
