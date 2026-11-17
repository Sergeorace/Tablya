# Tablya — Règles projet pour agents

## Contexte
Plateforme SaaS multi-tenant restaurants/bars (Togo, XOF, mobile money). Conception complète dans `docs/01`–`docs/07`. CDC source : `tablya_cdc.txt`.

## Stack
- `apps/api` : NestJS 10 + TypeScript + Prisma 5 + PostgreSQL (RLS) + Redis/ioredis + JWT/passport + argon2 (`@node-rs/argon2`)
- `apps/web` : Next.js 14 + React 18 + Tailwind + TanStack Query + RHF/Zod + next-intl
- `apps/mobile` : Flutter + Riverpod + go_router + dio + drift (SQLite) + mobile_scanner + socket_io_client
- `infra/docker-compose.yml` : Postgres 16, Redis 7, MinIO

## Commandes
- Install : `npm install` (workspaces à la racine)
- API : `cd apps/api && npm run start:dev` (port 3000, préfixe `/api/v1`)
- Prisma : `npx prisma generate|migrate dev|migrate deploy|studio` dans `apps/api`
- RLS : `npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma`
- Seed : `npx ts-node prisma/seed.ts` (depuis `apps/api`)
- Build : `npm run build` (racine) ; tests : `npm run test -w apps/api`

## Règles strictes
1. `tenant_id` sur toute table métier ; jamais de cross-tenant ; utiliser `withTenant()` pour les requêtes tenant.
2. `idempotency_key` (UUID) sur `commande` et `transaction` ; `reference_externe` unique par fournisseur.
3. Montants en `bigint` centimes ; jamais de float pour l'argent.
4. Logs via `JsonLogger` uniquement — champs `timestamp/level/service/event/tenant_id/request_id/trace_id` ; JAMAIS de PII/secrets (le logger masque, ne pas contourner).
5. Actions sensibles → `audit_log` (append-only) avec `motif`.
6. Routes publiques : `@Public()` ; protégées : `JwtAuthGuard` global + `@RequirePermissions('module.action')`.
7. Migrations Prisma : expand/contract, jamais de breaking sur grosses tables (`CONCURRENTLY`).
8. Commentaires en français, code en anglais ; conventions nommage : entités PascalCase FR (Etablissement, Place…), champs snake_case en base.
9. Ne pas committer `.env` ni secrets ; voir `.env.example`.

## État d'avancement
Voir README §État. Prochaine épopée : E2 (catalogue + plan de salle).
