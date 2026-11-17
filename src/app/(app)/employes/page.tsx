'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Employe {
  id: string; nom: string; prenom: string; poste: string;
  telephone: string | null; statutContrat: string | null;
  salaireBaseCentimes: string | null; dateEmbauche: string | null;
  utilisateurId: string | null;
}

const xof = (c: string | null) =>
  c == null ? '—' : `${Number(BigInt(c)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

export default function EmployesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', poste: '', telephone: '', salaire: '', pin: '' });
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Employe[]>({
    queryKey: ['employes'],
    queryFn: async () => (await api.get('/employes')).data,
  });

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/employes', {
        nom: form.nom, prenom: form.prenom, poste: form.poste,
        telephone: form.telephone || undefined,
        salaireBaseCentimes: form.salaire ? Math.round(Number(form.salaire) * 100) : undefined,
        pin: form.pin || undefined,
      });
      setOpen(false);
      setForm({ nom: '', prenom: '', poste: '', telephone: '', salaire: '', pin: '' });
      qc.invalidateQueries({ queryKey: ['employes'] });
    } catch {
      setError('Création impossible — vérifiez les champs (PIN = 4 à 6 chiffres).');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Équipe</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {open ? 'Fermer' : '+ Nouvel employé'}
        </button>
      </div>

      {open && (
        <form onSubmit={creer} className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900">
          {([
            ['nom', 'Nom'], ['prenom', 'Prénom'], ['poste', 'Poste'],
            ['telephone', 'Téléphone'], ['salaire', 'Salaire (F/mois)'], ['pin', 'PIN pointage (4-6 chiffres)'],
          ] as const).map(([k, label]) => (
            <label key={k} className="text-sm font-medium">
              {label}
              <input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required={['nom', 'prenom', 'poste'].includes(k)}
                inputMode={k === 'pin' ? 'numeric' : undefined}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          ))}
          {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white sm:col-span-3">
            Créer
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-4 py-3">Nom</th><th className="px-4 py-3">Poste</th>
              <th className="px-4 py-3">Téléphone</th><th className="px-4 py-3">Salaire</th>
              <th className="px-4 py-3">Contrat</th><th className="px-4 py-3">Compte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">Chargement…</td></tr>}
            {(data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.prenom} {e.nom}</td>
                <td className="px-4 py-3">{e.poste}</td>
                <td className="px-4 py-3">{e.telephone ?? '—'}</td>
                <td className="px-4 py-3">{xof(e.salaireBaseCentimes)}</td>
                <td className="px-4 py-3">{e.statutContrat ?? '—'}</td>
                <td className="px-4 py-3">{e.utilisateurId ? 'lié' : 'non lié'}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">Aucun employé</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
