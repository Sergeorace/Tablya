'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Pilotage' },
  { href: '/salle', label: 'Plan de salle' },
  { href: '/commandes', label: 'Commandes' },
  { href: '/employes', label: 'Équipe' },
  { href: '/paie', label: 'Paie' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-400">Chargement…</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="font-bold text-teal-700">Tablya</div>
          <div className="truncate text-xs text-neutral-500">{user.etablissement}</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-800">
          <div className="truncate">{user.email}</div>
          <div className="mt-0.5">{user.role}</div>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
