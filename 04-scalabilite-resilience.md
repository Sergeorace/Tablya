# Tablya — Livrable 4 : Scalabilité et résilience

## 4.1 Multi-tenant

- **Modèle** : schéma partagé + `tenant_id` + **PostgreSQL RLS** (`current_setting('app.tenant_id')`), rôle applicatif sans `BYPASSRLS` ; contexte injecté depuis JWT/slug uniquement.
- Tables globales sans RLS : `role`, `permission`, `etablissement` (registre), `subscription`, `audit_log` plateforme.
- Écarté : schéma/base dédiée dès v1 (complexité ×N) — réservé aux grands comptes.

### Critères de bascule « tenant dédié » (30 jours)

| Critère | Seuil |
|---|---|
| Volume | > 50 Go tables métier ou > 5 M commandes/mois |
| Performance | p95 > 800 ms malgré index, ou noisy neighbor avéré |
| Contrat | Exigence client Entreprise |
| Réglementaire | Obligation sectorielle |

Bascule : export/Import → fenêtre maintenance → routeur `etablissement.isolation_level` (`shared|dedicated`) → rollback < 24 h.

### Tests d'isolation (CI)

Cross-tenant 403/404 sur chaque endpoint ; scan des fuites ; revue trimestrielle des policies RLS.

## 4.2 Scale horizontale

| Service | Stratégie |
|---|---|
| `svc-api` | Conteneurs identiques derrière LB ; JWT stateless ; refresh en Redis |
| `svc-paiement` | Idempotent → scaling libre ; rate-limit fournisseur en Redis |
| `realtime` | **Redis adapter Socket.IO** ; rooms `tenant:{id}:*` ; pas de sticky requis |
| `worker` | Consumers horizontaux ; concurrency par file |
| `svc-paie` | Jobs mensuels — non critique |

### Partitionnement / index

| Table | Volume (500 étab. × 2 ans) | Stratégie |
|---|---|---|
| `commande` | 50–100 M | Partition mensuel `created_at` + index `(tenant_id, statut, created_at DESC)` |
| `transaction` | 80–150 M | Partition mensuel + `(tenant_id,statut)`, `(reference_externe)`, `idempotency_key` unique |
| `payment_event` | ~200 M | Partition mensuel + archive S3 > 24 mois |
| `ligne_commande` | ~300 M | Partition suit `commande` |
| `audit_log` | ~500 M | Partition mensuel, jamais DELETE |
| `pointage`,`planning` | ~10 M | `(tenant_id, employe_id, jour)` |
| `place`,`reservation` | <5 M | `UNIQUE(tenant_id, numero)` + EXCLUDE anti-double-booking |

Index transverses : `tenant_id` en tête des composites ; `qr_token` unique ; `slug` unique.

### Cache

| Donnée | Cache | TTL | Invalidation |
|---|---|---|---|
| Menu public | Redis `menu:{tenant}` | 60 s | Pub/sub `menu.changed` |
| Places | Redis | 10 s | Pub/sub `place.statut_change` |
| Sessions/permissions | Redis | = token | Révocation explicite |
| Dashboard | `daily_stats` + Redis | 5 min | Cron horaire |
| Recherche | Redis | 5 min | — |

## 4.3 Concurrence

| Problème | Mécanisme |
|---|---|
| Double réservation | `EXCLUDE USING gist (place_id WITH =, tstzrange(...) WITH &&) WHERE statut='confirmee'` + `FOR UPDATE` |
| Double scan QR | `UPDATE place SET statut='occupee' WHERE id=? AND statut='libre'` atomique ; `commande_active_id` |
| Double paiement | `idempotency_key` unique + machine à états ; commande `cloturee` → 409 |
| Double encaissement | `reference_externe` unique + `payment_event` dedup |
| Conflit hors ligne | Détecté à sync → file `conflicted`, résolution assistée |
| Paie doublée | Transition atomique + `UNIQUE(tenant_id, employe_id, periode)` |
| Survente stock | `UPDATE stock SET quantite=quantite-? WHERE quantite>=?` + `CHECK >= 0` |

## 4.4 Files BullMQ

| File | Producteur | Retry |
|---|---|---|
| `payment.webhook` | svc-paiement | 5 tentatives, backoff 1s→30s, DLQ |
| `commande.events` | svc-api | 3 tentatives |
| `notifications.send` | tous | 5 tentatives, 5s→5min |
| `paie.monthly` | cron | J-2, relance J-1 |
| `paie.salaires` | svc-paie | par bulletin, `a_rejouer` |
| `reconcile.hourly` | cron | horaire, alerte >3 échecs |
| `exports.generate` | svc-api | 3 tentatives |
| `sync.conflicts` | svc-api | notif manager |

Règles : DLQ `*.failed` + alerte ; jobs idempotents ; visibility timeout ≥10× durée max ; graceful shutdown.

## 4.5 Cache / rate-limit / pics

- Rate limiting Redis token bucket : API 300 req/min/user, auth 10/min/IP, webhooks 1000/min/fournisseur ; 429 + `Retry-After`.
- WAF/Cloudflare : TLS, bot fight, rate-limit edge.
- HPA sur CPU >70 % **et** files >500 ; warm-up événements.
- Circuit breaker fournisseurs : 3 échecs → ouvert 60 s → bascule secondaire ; sonde semi-ouverte.
- Webhooks toujours 202 puis async — jamais de perte.

## 4.6 HA

| Composant | Stratégie | RPO | RTO |
|---|---|---|---|
| API/Workers | ≥2 réplicas multi-AZ | — | <5 min |
| PostgreSQL | Managed + replica streaming + failover + PITR | ≤5 min | <15 min |
| Redis | Managed HA + AOF | ≤1 min | <5 min |
| S3 | Versioning/réplication | 0 | immédiat |
| BullMQ | Redis persisté | ≤1 min | <5 min |

Sauvegardes : snapshot quotidien + WAL continu ; rétention 30 j (CDC) ; **restauration testée mensuellement**. Bascule paiement : `payment_success_rate <90 %`/5 min → routage secondaire ; transactions `en_attente` réconciliées au retour ; moyens non couverts → indisponibilité propre.

## 4.7 Test de charge

| Scénario | Charge | Outil | Seuil |
|---|---|---|---|
| Lecture menu/places | 10 000 users, 70 % lecture | k6 | p95 <500 ms, erreurs <0,5 % |
| Pic service | 500 étab. × 40 places, 20 % cmd/min | k6+Gatling | KDS <2 s, cmd <500 ms p95 |
| Paiement burst | 500 tx/min, webhooks 1000/min | k6 + sim webhook | 0 double encaissement, webhooks <30 s |
| Sync hors ligne | 1 000 devices × batch 50 | custom | <60 s/device, 0 perte |
| Paie mensuelle | 10 000 bulletins | batch test | <30 min, 0 échec |
| Endurance | nominal ×4 h | k6 | pas de fuite, p95 ±10 % |

## 4.8 Coûts indicatifs (cloud public, région UE ~120–150 ms vers Lomé)

| Palier | Charge | Coût mensuel |
|---|---|---|
| Pilote | ≤10 étab. | 80–200 $ |
| Lancement | 50 étab., ~1 000 users | 400–900 $ |
| V1 cible | 500 étab., 10 000 users | 1 500–4 000 $ |

Hypothèses : managé vs auto-hébergé, redondance ; affiner après test de charge + mesure latence réelle.
