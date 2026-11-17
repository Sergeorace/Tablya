'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Place {
  id: string; numero: string; statut: string; capacite: number; type: string;
  commandes?: { id: string; statut: string; totalCentimes: string }[];
}
interface Zone { id: string; nom: string; places: Place[] }

const STATUT_STYLES: Record<string, string> = {
  libre: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  occupee: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  reservee: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  addition: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  nettoyage: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  hors_service: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-900',
};

export default function SallePage() {
  const { data, isLoading, error } = useQuery<{ zones: Zone[] }>({
    queryKey: ['salle-plan'],
    queryFn: async () => (await api.get('/salle/plan')).data,
    refetchInterval: 15_000,
  });

  if (isLoading) return <p className="text-neutral-400">Chargement…</p>;
  if (error) return <p className="text-red-600">Erreur de chargement du plan de salle.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Plan de salle</h1>
        <span className="text-xs text-neutral-400">Actualisation auto 15 s</span>
      </div>
      {(data?.zones ?? []).map((zone) => (
        <section key={zone.id}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {zone.nom}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {zone.places.map((p) => {
              const cmd = p.commandes?.[0];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 ${STATUT_STYLES[p.statut] ?? 'bg-white dark:bg-neutral-900'}`}
                >
                  <div className="font-mono text-lg font-bold">{p.numero}</div>
                  <div className="text-xs opacity-80">{p.capacite} pers. · {p.type}</div>
                  <div className="mt-1 text-xs font-medium uppercase">{p.statut}</div>
                  {cmd && (
                    <div className="mt-1 truncate text-xs">
                      Cmd {cmd.statut} · {(Number(BigInt(cmd.totalCentimes)) / 100).toFixed(0)} F
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
