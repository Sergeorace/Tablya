import './globals.css';

export const metadata = {
  title: 'Tablya — Back-office',
  description: 'Plateforme de gestion pour restaurants et bars',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
