# Tablya — Livrable 2 : Journalisation, audit et observabilité

## 2.1 Logs structurés (JSON / NDJSON)

### Format canonique (stdout, collecté par Vector/Fluent Bit)

```json
{
  "timestamp": "2026-11-17T14:32:07.421Z",
  "level": "info",
  "service": "svc-paiement",
  "event": "payment.webhook.received",
  "tenant_id": "3f8a2c1e-9b4d-4e7a-b2c1-8d5f6a7e9b0c",
  "etablissement_id": "7c1d...",
  "user_id": "usr_...",
  "client_id": "cli_...",
  "request_id": "req_01J8XYZ...",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "http": { "method": "POST", "route": "/webhooks/fedapay", "status": 200, "duration_ms": 187 },
  "message": "Webhook FedaPay reçu et accepté",
  "context": { "transaction_id": "txn_...", "reference_externe": "fp_...", "fournisseur": "fedapay" },
  "error": null,
  "env": "production",
  "version": "1.4.2"
}
```

### Champs obligatoires

| Champ | Règle |
|---|---|
| `timestamp` | ISO 8601 UTC, milliseconde |
| `level` | `debug` < `info` < `warn` < `error` < `fatal` |
| `service` | `svc-api`, `svc-paiement`, `svc-paie`, `svc-notifications`, `worker`, `realtime` |
| `event` | Nom hiérarchique `domaine.action` (ex. `commande.creee`) — jamais de phrase libre |
| `tenant_id` | Obligatoire sauf contexte super-admin ; propagé via JWT + header `X-Tenant-Id` + baggage |
| `request_id` | Généré par middleware NestJS, propagé à tous les appels internes |
| `trace_id`/`span_id` | OpenTelemetry W3C, propagé HTTP + BullMQ (`job.data._trace`) + Socket.IO |
| `user_id` | UUID interne si authentifié ; jamais e-mail/téléphone en clair |
| `duration_ms` | Par span/opération |
| `version` | Build SHA pour corrélation logs ↔ déploiement |

### Corrélation

`traceparent`/`tracestate` sur HTTP interne ; `trace_id` dans les jobs BullMQ ; `request_id` relie `audit_log` ↔ logs applicatifs. Un événement métier = un log `info` structuré.

## 2.2 Données sensibles — interdiction de journaliser

**Jamais logué** : numéros de carte (même tronqués < 6+4), CVV, expiration, mots de passe (même hashés), PIN pointage, OTP, JWT/refresh/cookies, clés API fournisseurs, credentials DB/Redis, téléphones complets (→ `+228•••••34` ou `phone_hash`), coordonnées bancaires, contenu messages clients.

**Mécanismes** : allowlist de champs ; redaction auto des clés `password|token|otp|card|cvv|secret|authorization` → `[REDACTED]` ; `maskPII()` sur `phone|email|name` ; règle lint interdisant `logger.*(request.body)` brut ; scan nocturne des archives (regex carte `\d{13,19}`, JWT `eyJ`) → alerte + purge.

## 2.3 Journal d'audit immuable

```sql
CREATE TABLE audit_log (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, utilisateur_id uuid,
    etablissement_id uuid NOT NULL, action varchar(80) NOT NULL,
    entite_type varchar(50) NOT NULL, entite_id uuid NOT NULL,
    avant jsonb, apres jsonb, motif text NOT NULL,
    ip inet, request_id varchar(64),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable(); -- append-only
```

**Actions auditées** : `commande.annuler`, `remise.appliquer`, `prix.modifier`, `caisse.ouvrir/cloturer`, `cloture.ecart`, `transaction.rembourser`, `portefeuille.retirer`, `commission.modifier`, `role.creer/modifier`, `permission.retirer`, `employe.suspendre`, `pointage.corriger`, `paie.bulletin.approuver`, `paiement_salaire.rejouer`, `etablissement.suspendre`, `abonnement.resilier`, `charte.modifier`, `auth.login.echec_repetes`, `mfa.desactiver`, `session.revoquer`.

`motif` obligatoire pour actions financières ; rétention 5 ans ; accès rôle `auditeur`/`gerant` (`audit.lire`).

## 2.4 Journal des transactions de paiement — table `payment_event`

```sql
CREATE TABLE payment_event (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
    transaction_id uuid NOT NULL REFERENCES transaction(id),
    fournisseur varchar(20) NOT NULL, type varchar(40) NOT NULL,
    reference_externe varchar(120), payload_hash varchar(64),
    statut varchar(20), http_status smallint, duree_ms int,
    erreur_code varchar(50), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_payment_event_dedup
    ON payment_event(fournisseur, reference_externe, type) WHERE statut='processed';
```

Cycle tracé : `initiate`, `webhook`, `refund`, `payout`, `reconcile`. `TRANSACTION.reponse_fournisseur` = dernière réponse utile (≤ 8 Ko). Idempotence à 3 niveaux : `idempotency_key` client → `reference_externe` unique → index dédoublonnage.

## 2.5 Rétention / rotation / archivage

| Donnée | Chaude | Archive | Base |
|---|---|---|---|
| Logs applicatifs | 30 j | S3/Glacier 13 mois | Exploitation |
| `audit_log` | 5 ans | S3 5 ans | Comptabilité/fiscal (à confirmer juridique) |
| `transaction`, `payment_event` | 5 ans | > 24 mois → S3 | Traçabilité financière |
| `bulletin_paie` PDF | 5 ans | S3 URLs signées | Obligations sociales ToGo (à vérifier) |
| Données client | relation + 3 ans | Anonymisation sur demande | Loi 2019-014 / RGPD |
| Logs techniques | 12 mois | 12 mois | Sécurité |

Rotation quotidienne (max 1 Go / 100 M lignes), compression gzip, partitionnement mensuel des grosses tables (`commande`, `transaction`, `payment_event`, `audit_log`) avec `DETACH` > 12 mois. Loi 2019-014/RGPD : registre des traitements, DPO si seuil, droit d'accès/export/suppression (`GET /rgpd/export`), violation → autorité sous 72 h.

## 2.6 Observabilité

| Couche | Outil |
|---|---|
| Collecte | OpenTelemetry SDK + Vector/Fluent Bit |
| Logs | Loki (ou Elasticsearch si volume) + archive S3 |
| Métriques | Prometheus + Grafana |
| Traces | Tempo/Jaeger (OTel) |
| Erreurs | Sentry (backend, Flutter, Next.js) |
| Alertes | Alertmanager → Slack/email/oncall |
| Synthétique | UptimeRobot + smoke tests post-déploiement |

### Métriques clés et seuils

| Métrique | Avert. | Critique |
|---|---|---|
| `http_request_duration_p95` | > 400 ms | > 500 ms |
| `http_requests_total` 5xx | > 1 % | > 5 % /5 min |
| `kds_display_latency` | > 1,5 s | > 2 s |
| `payment_success_rate` par fournisseur | < 95 % | < 90 % → bascule routage |
| `webhook_processing_lag` | > 60 s | > 5 min |
| `queue_depth` | > 1 000 | > 10 000 |
| `queue_failed_total` | > 10/h | > 50/h |
| `db_connections_active` | > 70 % pool | > 90 % |
| `sync_conflicts_total` | > 20/h/tenant | > 100/h |
| `reconciliation_discrepancy_amount` | > 0 | > 50 000 XOF cumulés |
| `availability_monthly` | < 99,95 % | < 99,9 % |
| `auth_login_failures` | > 10/min/IP | > 50/min |

## 2.7 Exemples de logs

**1. Paiement TMoney succès**
```json
{"timestamp":"2026-11-17T19:04:12.311Z","level":"info","service":"svc-paiement","event":"payment.initiated","tenant_id":"3f8a2c1e","context":{"transaction_id":"txn_55aa","montant_centimes":500000,"fournisseur":"fedapay","moyen":"tmoney"}}
{"timestamp":"2026-11-17T19:04:12.980Z","level":"info","service":"svc-paiement","event":"payment.webhook.received","tenant_id":"3f8a2c1e","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","context":{"reference_externe":"fp_8Xk2","signature":"verified","dedup":"new"}}
{"timestamp":"2026-11-17T19:04:13.402Z","level":"info","service":"worker","event":"payment.confirmed","tenant_id":"3f8a2c1e","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","context":{"commission_centimes":25000,"net_portefeuille_centimes":475000}}
```

**2. Webhook signature invalide**
```json
{"timestamp":"2026-11-17T19:11:44.009Z","level":"error","service":"svc-paiement","event":"payment.webhook.signature_invalid","tenant_id":"3f8a2c1e","context":{"fournisseur":"cinetpay","reference_externe":"cp_77Q","payload_hash":"a94a8fe5"},"error":{"code":"WEBHOOK_SIG_INVALID"}}
```

**3. Sync hors ligne avec conflit**
```json
{"timestamp":"2026-11-17T20:02:31.550Z","level":"info","service":"svc-api","event":"sync.batch.received","tenant_id":"3f8a2c1e","context":{"device_id":"tab_04","batch_size":7,"offline_duration_s":342}}
{"timestamp":"2026-11-17T20:02:31.812Z","level":"warn","service":"svc-api","event":"sync.conflict.place_occupied","tenant_id":"3f8a2c1e","context":{"seq":3,"place_numero":"LOME01-TER-014","conflicting_commande":"cmd_88f1"}}
```

**4. Paiement échoué puis retry**
```json
{"timestamp":"2026-11-17T20:15:09.120Z","level":"warn","service":"worker","event":"payment.retry.scheduled","tenant_id":"3f8a2c1e","context":{"transaction_id":"txn_61bb","attempt":2,"backoff_ms":4000,"error_code":"PROVIDER_TIMEOUT"}}
{"timestamp":"2026-11-17T20:15:13.880Z","level":"error","service":"worker","event":"payment.failed.final","tenant_id":"3f8a2c1e","context":{"transaction_id":"txn_61bb","attempts":5,"statut":"echouee"}}
```

**5. Approbation de paie**
```json
{"timestamp":"2026-11-30T09:00:01.200Z","level":"info","service":"svc-paie","event":"paie.batch.approved","tenant_id":"3f8a2c1e","user_id":"usr_gerant_01","context":{"periode":"2026-11","bulletins":14,"total_net_centimes":8450000,"mfa":"verified"}}
```
