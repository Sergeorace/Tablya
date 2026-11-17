# Tablya

Plateforme SaaS multi-tenant pour grands restaurants et bars : gestion (commandes, plan de salle, caisse, stocks, équipe, paie) + application client (menu, réservation, commande, paiement mobile money) + back-office super-admin.

Marché : Togo / Afrique de l'Ouest (XOF, TMoney, Moov Money). Mobile Android/iOS (Flutter) + back-office web (Next.js) + API (NestJS) + PostgreSQL RLS.

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/01-diagrammes.md` | C4, ERD, séquences, machines à états, réconciliation |
| `docs/02-logs-audit-observabilite.md` | Logs JSON, audit immuable, métriques/alertes |
| `docs/03-responsivite-ergonomie.md` | Breakpoints, KDS, perf perçue, accessibilité |
| `docs/04-scalabilite-resilience.md` | Multi-tenant, HA, RPO/RTO, charge, coûts |
| `docs/05-choix-technologiques.md` | Stack par couche + alternatives |
| `docs/06-securite-conformite.md` | Chiffrement, OWASP, PCI SAQ A, RGPD/law 2019-014 |
| `docs/07-plan-realisation.md` | Épopées E0–E10, user stories, MVP, risques |
| `tablya_cdc.txt` | Cahier des charges source (extrait texte) |

## Structure

```
apps/
  api/      NestJS + Prisma + PostgreSQL RLS + Redis/BullMQ (socle E0/E1)
  web/      Next.js 14 + Tailwind + shadcn/ui (back-office)
  mobile/   Flutter (Dart) — espace client + personnel
infra/
  docker-compose.yml   Postgres 16 + Redis 7 + MinIO (dev local)
packages/  (partagés à venir)
```

## Démarrage (dev)

```bash
# 1. Infra locale (Docker requis)
npm run docker:up          # postgres:5432, redis:6379, minio:9000/9001

# 2. API
cp apps/api/.env.example apps/api/.env
cd apps/api
npx prisma migrate deploy   # ou prisma migrate dev
npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma
npx ts-node prisma/seed.ts  # permissions
npm run start:dev           # http://localhost:3000/api/v1

# 3. Web
npm run dev:web             # http://localhost:3001
```

## Conventions clés

- **Multi-tenant** : `tenant_id` partout + RLS PostgreSQL ; contexte via `PrismaService.withTenant()`.
- **Idempotence** : `idempotency_key` sur `commande`/`transaction` ; `reference_externe` unique par fournisseur.
- **Logs** : JSON structuré via `JsonLogger` (request_id/trace_id/tenant_id propagés par ALS).
- **RBAC** : permissions `module.action` ; `@RequirePermissions()` + guards.
- **Argon2id** pour les mots de passe (`@node-rs/argon2`).
- Montants : `bigint` centimes XOF. Dates : `timestamptz`.

## État

- [x] Conception complète (7 livrables, `docs/`)
- [x] Socle API : auth JWT/refresh (Redis), register établissement, guards RBAC, logger JSON, health
- [x] Schéma Prisma complet (ERD) + `rls.sql`
- [x] Squelettes web (Next.js) et mobile (Flutter)
- [x] E2 (partiel) : zones, places `ETAB-ZONE-NNN` + `qr_token`, plan de salle, résolution QR publique, catalogue catégories/produits/variantes, menu public
- [ ] E2 suite : éditeur visuel plan de salle (front), impression QR, réservations
- [x] E3 commandes/POS (idempotent, KDS, Socket.IO) · E4 paiement (FedaPay+CinetPay, webhooks signés, BullMQ, portefeuille, reversements) · [ ] E5 client · E6 équipe · E7 paie · E8 pilotage · E9 notifications · E10 recette
