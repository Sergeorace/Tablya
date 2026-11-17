'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Employe { id: string; nom: string; prenom: string; poste: string }
interface Planning {
  id: string; jour: string; debut: string; fin: string; poste: string | null; statut: string;
  employe: { id: string; nom: string; prenom: string; poste: string };
}
interface Pointage {
  id: string; heureArrivee: string | null; heureDepart: string | null;
  methode: string; statut: string;
  employe: { id: string; nom: string; prenom: string; poste: string };
}

const STATUT_PLANNING: Record<string, string> = {
  planifie: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  confirme: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  annule: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  conge: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
};
const STATUT_POINTAGE: Record<string, string> = {
  present: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  retard: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  absent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => toISODate(new Date());

function debutSemaine(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // dimanche = début
  return x;
}

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jourLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PlanningPage() {
  const qc = useQueryClient();
  const [onglet, setOnglet] = useState<'planning' | 'pointages'>('planning');
  const [semaine, setSemaine] = useState(() => debutSemaine(new Date()));
  const [jourPointage, setJourPointage] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeId: '', jour: today(), debut: '08:00', fin: '16:00', poste: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const debut = toISODate(semaine);
  const fin = toISODate(new Date(semaine.getTime() + 6 * 86400_000));

  const { data: employes = [] } = useQuery<Employe[]>({
    queryKey: ['employes'],
    queryFn: async () => (await api.get('/employes')).data,
  });
  const { data: plannings = [], isLoading: loadP } = useQuery<Planning[]>({
    queryKey: ['plannings', debut, fin],
    queryFn: async () =>
      (await api.get('/plannings', { params: { debut, fin } })).data,
    enabled: onglet === 'planning',
  });
  const { data: pointages = [], isLoading: loadPt } = useQuery<Pointage[]>({
    queryKey: ['pointages', jourPointage],
    queryFn: async () =>
      (await api.get('/pointages', { params: { date: jourPointage } })).data,
    enabled: onglet === 'pointages',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['plannings'] });
    qc.invalidateQueries({ queryKey: ['pointages'] });
  };

  async function creerShift(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/plannings', {
        employeId: form.employeId, jour: form.jour,
        debut: form.debut, fin: form.fin, poste: form.poste || undefined,
      });
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Création impossible — chevauchement ou horaire invalide.');
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(p: Planning) {
    if (!confirm(`Supprimer le shift de ${p.employe.prenom} ${p.employe.nom} ?`)) return;
    await api.delete(`/plannings/${p.id}`);
    refresh();
  }

  const nom = (e: { nom: string; prenom: string }) => `${e.prenom} ${e.nom}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Planning &amp; pointage</h1>
        <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
          {(['planning', 'pointages'] as const).map((t) => (
            <button key={t} onClick={() => setOnglet(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${onglet === t ? 'bg-teal-700 text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>
              {t === 'planning' ? 'Planning' : 'Pointages'}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'planning' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setSemaine(new Date(semaine.getTime() - 7 * 86400_000))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">←</button>
              <span className="text-sm font-medium">
                {new Date(`${debut}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                {' — '}
                {new Date(`${fin}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </span>
              <button onClick={() => setSemaine(new Date(semaine.getTime() + 7 * 86400_000))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">→</button>
            </div>
            <button onClick={() => setShowForm((s) => !s)}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
              + Shift
            </button>
          </div>

          {showForm && (
            <form onSubmit={creerShift}
              className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-neutral-800 dark:bg-neutral-900">
              <select required value={form.employeId}
                onChange={(e) => setForm({ ...form, employeId: e.target.value })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
                <option value="">Employé…</option>
                {employes.map((e) => <option key={e.id} value={e.id}>{nom(e)} — {e.poste}</option>)}
              </select>
              <input required type="date" value={form.jour}
                onChange={(e) => setForm({ ...form, jour: e.target.value })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <input required type="time" value={form.debut}
                onChange={(e) => setForm({ ...form, debut: e.target.value })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <input required type="time" value={form.fin}
                onChange={(e) => setForm({ ...form, fin: e.target.value })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <input value={form.poste} placeholder="Poste (ex: bar)"
                onChange={(e) => setForm({ ...form, poste: e.target.value })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <button disabled={busy}
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? '…' : 'Créer'}
              </button>
              {error && <p className="text-sm text-red-600 sm:col-span-6">{error}</p>}
            </form>
          )}

          {loadP && <p className="text-neutral-400">Chargement…</p>}
          {!loadP && plannings.length === 0 && (
            <p className="text-neutral-400">Aucun shift cette semaine.</p>
          )}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {plannings.map((p) => (
              <div key={p.id}
                className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-neutral-500">{jourLabel(p.jour)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_PLANNING[p.statut] ?? ''}`}>
                    {p.statut}
                  </span>
                </div>
                <div className="mt-1 font-semibold">{nom(p.employe)}</div>
                <div className="text-sm text-neutral-500">
                  {heure(p.debut)} → {heure(p.fin)}
                  {p.poste ? ` · ${p.poste}` : ''}
                </div>
                <button onClick={() => supprimer(p)}
                  className="mt-2 text-xs text-red-600 hover:underline">Supprimer</button>
              </div>
            ))}
          </div>
        </>
      )}

      {onglet === 'pointages' && (
        <>
          <input type="date" value={jourPointage}
            onChange={(e) => setJourPointage(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          {loadPt && <p className="text-neutral-400">Chargement…</p>}
          {!loadPt && pointages.length === 0 && (
            <p className="text-neutral-400">Aucun pointage ce jour.</p>
          )}
          <div className="space-y-2">
            {pointages.map((p) => (
              <div key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  <span className="font-medium">{nom(p.employe)}</span>
                  <span className="ml-2 text-sm text-neutral-500">{p.employe.poste}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span>Arrivée {p.heureArrivee ? heure(p.heureArrivee) : '—'}</span>
                  <span>Départ {p.heureDepart ? heure(p.heureDepart) : '—'}</span>
                  <span className="text-xs text-neutral-400">{p.methode}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_POINTAGE[p.statut] ?? ''}`}>
                    {p.statut}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">
            Les corrections de pointage (motif + audit) se font via l'app staff ou l'API — POST /pointages/:id.
          </p>
        </>
      )}
    </div>
  );
}
