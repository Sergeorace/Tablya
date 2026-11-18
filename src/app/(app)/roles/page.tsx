'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Permission {
  id: string; code: string; module: string; description: string | null;
}

interface Role {
  id: string; code: string; nom: string; systeme: boolean; description: string | null;
  permissions: { permission: Permission }[];
  _count: { utilisateurs: number };
}

const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export default function RolesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ code: '', nom: '', description: '', permissionIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });
  const { data: permissions } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: async () => (await api.get('/roles/permissions')).data,
  });

  const parModule = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const list = m.get(p.module) ?? [];
      list.push(p);
      m.set(p.module, list);
    }
    return Array.from(m.entries());
  }, [permissions]);

  function openCreate() {
    setEditing(null);
    setForm({ code: '', nom: '', description: '', permissionIds: [] });
    setOpen(true);
  }

  function openEdit(r: Role) {
    setEditing(r);
    setForm({
      code: r.code, nom: r.nom, description: r.description ?? '',
      permissionIds: r.permissions.map((p) => p.permission.id),
    });
    setOpen(true);
  }

  function togglePerm(id: string) {
    setForm((f) => ({
      ...f,
      permissionIds: f.permissionIds.includes(id)
        ? f.permissionIds.filter((x) => x !== id)
        : [...f.permissionIds, id],
    }));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.patch(`/roles/${editing.id}`, {
          nom: form.nom, description: form.description || undefined,
          permissionIds: form.permissionIds,
        });
      } else {
        await api.post('/roles', {
          code: form.code, nom: form.nom,
          description: form.description || undefined,
          permissionIds: form.permissionIds,
        });
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['roles'] });
    } catch {
      setError('Enregistrement impossible — code déjà pris ou permissions invalides.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Rôles & permissions</h1>
        <button onClick={openCreate}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          + Nouveau rôle
        </button>
      </div>

      {open && (
        <form onSubmit={enregistrer}
          className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Code
              <input className={`${input} mt-1 font-mono`} value={form.code} disabled={!!editing}
                onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="caissier" />
            </label>
            <label className="text-sm">Nom
              <input className={`${input} mt-1`} value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Caissier" />
            </label>
            <label className="text-sm">Description
              <input className={`${input} mt-1`} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Permissions ({form.permissionIds.length} sélectionnées)
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {parModule.map(([module, perms]) => (
                <fieldset key={module} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
                  <legend className="px-1 text-xs font-semibold uppercase text-neutral-500">{module}</legend>
                  {perms.map((p) => (
                    <label key={p.id} className="flex items-start gap-2 py-1 text-xs">
                      <input type="checkbox" className="mt-0.5"
                        checked={form.permissionIds.includes(p.id)}
                        onChange={() => togglePerm(p.id)} />
                      <span>
                        <span className="font-mono">{p.code}</span>
                        {p.description && <span className="block text-neutral-500">{p.description}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              {editing ? 'Mettre à jour' : 'Créer le rôle'}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-neutral-300 px-5 py-2 text-sm dark:border-neutral-700">
              Annuler
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Chargement…</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(roles ?? []).map((r) => (
          <div key={r.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{r.nom}
                  {r.systeme && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase dark:bg-neutral-800">système</span>}
                </p>
                <p className="font-mono text-xs text-neutral-500">{r.code}</p>
              </div>
              {!r.systeme && (
                <button onClick={() => openEdit(r)}
                  className="text-sm text-teal-700 hover:underline">Modifier</button>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {r.permissions.length} permissions · {r._count.utilisateurs} utilisateur(s)
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.permissions.slice(0, 8).map((p) => (
                <span key={p.permission.id}
                  className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {p.permission.code}
                </span>
              ))}
              {r.permissions.length > 8 && (
                <span className="text-[10px] text-neutral-400">+{r.permissions.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
