'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Categorie { id: string; nom: string; ordre: number; active: boolean; _count?: { produits: number } }
interface Variante { id: string; nom: string; prixCentimes: string; actif: boolean }
interface Produit {
  id: string; nom: string; description?: string | null; disponible: boolean; actif: boolean;
  categorie?: { id: string; nom: string } | null;
  variantes: Variante[];
}

const xof = (c: string | number) =>
  `${Number(BigInt(c)) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
const toCentimes = (fcfa: string) => Math.round(parseFloat(fcfa.replace(/\s/g, '').replace(',', '.')) * 100);

interface FormState {
  id?: string;
  nom: string;
  description: string;
  categorieId: string;
  disponible: boolean;
  prix: string; // FCFA simple
  variantes: { id?: string; nom: string; prix: string }[];
}

const emptyForm: FormState = {
  nom: '', description: '', categorieId: '', disponible: true, prix: '', variantes: [],
};

export default function CataloguePage() {
  const qc = useQueryClient();
  const [filtre, setFiltre] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: categories = [] } = useQuery<Categorie[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });
  const { data: produits = [], isLoading } = useQuery<Produit[]>({
    queryKey: ['produits', filtre],
    queryFn: async () =>
      (await api.get('/produits', { params: { tous: 'true', ...(filtre ? { categorieId: filtre } : {}) } })).data,
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['produits'] }); qc.invalidateQueries({ queryKey: ['categories'] }); };

  async function nouvelleCategorie() {
    const nom = prompt('Nom de la catégorie');
    if (!nom?.trim()) return;
    await api.post('/categories', { nom: nom.trim() });
    refresh();
  }

  function openCreate() { setError(''); setForm({ ...emptyForm }); }
  function openEdit(p: Produit) {
    const v = p.variantes.filter((x) => x.nom !== 'Standard' || p.variantes.length > 1);
    setError('');
    setForm({
      id: p.id, nom: p.nom, description: p.description ?? '',
      categorieId: p.categorie?.id ?? '', disponible: p.disponible,
      prix: v.length === 0 && p.variantes[0]
        ? String(Number(BigInt(p.variantes[0].prixCentimes)) / 100)
        : '',
      variantes: v.map((x) => ({ id: x.id, nom: x.nom, prix: String(Number(BigInt(x.prixCentimes)) / 100) })),
    });
  }

  async function save() {
    if (!form || !form.nom.trim()) { setError('Nom requis'); return; }
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = {
        nom: form.nom.trim(),
        description: form.description || undefined,
        categorieId: form.categorieId || undefined,
        disponible: form.disponible,
      };
      if (form.variantes.length > 0) {
        body.variantes = form.variantes
          .filter((v) => v.nom.trim() && v.prix)
          .map((v) => ({ ...(v.id ? { id: v.id } : {}), nom: v.nom.trim(), prixCentimes: toCentimes(v.prix) }));
      } else if (form.prix) {
        body.prixCentimes = toCentimes(form.prix);
      }
      if (form.id) {
        // PATCH /produits accepte nom/description/categorie/disponible/
        // variantes/prixCentimes — un seul appel suffit.
        await api.patch(`/produits/${form.id}`, body);
      } else {
        await api.post('/produits', body);
      }
      setForm(null);
      refresh();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisponible(p: Produit) {
    await api.patch(`/produits/${p.id}/disponibilite`, { disponible: !p.disponible });
    refresh();
  }

  const prixMin = (p: Produit) =>
    p.variantes.length ? Math.min(...p.variantes.map((v) => Number(BigInt(v.prixCentimes)))) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Catalogue</h1>
        <div className="flex gap-2">
          <button onClick={nouvelleCategorie}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            + Catégorie
          </button>
          <button onClick={openCreate}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
            + Produit
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFiltre('')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${!filtre ? 'bg-teal-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          Tous
        </button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setFiltre(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filtre === c.id ? 'bg-teal-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
            {c.nom}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-neutral-400">Chargement…</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {produits.map((p) => (
          <article key={p.id}
            className={`rounded-xl border p-4 ${p.disponible ? 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900' : 'border-neutral-200 bg-neutral-50 opacity-70 dark:border-neutral-800 dark:bg-neutral-900'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{p.nom}</div>
                <div className="text-xs text-neutral-500">
                  {p.categorie?.nom ?? 'Sans catégorie'}
                  {p.variantes.length > 1 ? ` · ${p.variantes.length} formats` : ''}
                </div>
              </div>
              <span className="font-semibold text-teal-700">{xof(prixMin(p))}</span>
            </div>
            {p.description && (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{p.description}</p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => toggleDisponible(p)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.disponible ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800'}`}>
                {p.disponible ? 'Disponible' : 'Indisponible'}
              </button>
              <button onClick={() => openEdit(p)}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                Modifier
              </button>
            </div>
          </article>
        ))}
        {!isLoading && produits.length === 0 && (
          <p className="text-neutral-400">Aucun produit — créez la première catégorie puis un produit.</p>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setForm(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold">{form.id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
            <div className="space-y-3">
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Nom du produit" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optionnel)" rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
              <select value={form.categorieId} onChange={(e) => setForm({ ...form, categorieId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
                <option value="">Sans catégorie</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.disponible}
                  onChange={(e) => setForm({ ...form, disponible: e.target.checked })} />
                Disponible à la commande
              </label>

              {form.variantes.length === 0 ? (
                <div>
                  <label className="text-xs font-medium text-neutral-500">Prix (FCFA)</label>
                  <input value={form.prix} onChange={(e) => setForm({ ...form, prix: e.target.value })}
                    inputMode="decimal" placeholder="2500"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-neutral-500">Formats / variantes</div>
                  {form.variantes.map((v, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={v.nom} placeholder="Format (ex: Grand)"
                        onChange={(e) => {
                          const vs = [...form.variantes]; vs[i] = { ...v, nom: e.target.value };
                          setForm({ ...form, variantes: vs });
                        }}
                        className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                      <input value={v.prix} inputMode="decimal" placeholder="Prix F"
                        onChange={(e) => {
                          const vs = [...form.variantes]; vs[i] = { ...v, prix: e.target.value };
                          setForm({ ...form, variantes: vs });
                        }}
                        className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                      <button onClick={() => setForm({ ...form, variantes: form.variantes.filter((_, j) => j !== i) })}
                        className="px-2 text-neutral-400 hover:text-red-600">✕</button>
                    </div>
                  ))}
                  <button onClick={() => setForm({ ...form, variantes: [...form.variantes, { nom: '', prix: '' }] })}
                    className="text-xs font-medium text-teal-700 hover:underline">
                    + Ajouter un format
                  </button>
                  <button onClick={() => setForm({ ...form, variantes: [], prix: '' })}
                    className="ml-3 text-xs text-neutral-400 hover:underline">
                    Revenir au prix simple
                  </button>
                </div>
              )}
              {form.variantes.length === 0 && (
                <button onClick={() => setForm({ ...form, variantes: [{ nom: 'Standard', prix: form.prix }] })}
                  className="text-xs font-medium text-teal-700 hover:underline">
                  + Variantes (plusieurs formats)
                </button>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setForm(null)} disabled={busy}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Annuler</button>
                <button onClick={save} disabled={busy}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? '…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
