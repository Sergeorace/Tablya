# Tablya — Livrable 5 : Choix technologiques

## 5.1 Mobile (Flutter)

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Android+iOS une codebase | **Flutter/Dart** | Perf proche natif, rendu, hors ligne, caméra QR, un seul code | React Native (perf UI low-end), natif ×2, KMP/Compose MP (jeune) | Courbe Dart ; dépendance stores |
| State | **Riverpod** | Typage fort, testable, peu boilerplate | Bloc (verbeux), GetX (non maintenable) | Choix à figer tôt |
| Persistance locale | **SQLite `drift`** + `flutter_secure_storage` | ACID outbox, typé | Hive/Isar, shared_preferences | Migrations locales versionnées |
| Scan QR | **`mobile_scanner`** | Rapide, ML Kit/AVFoundation | ZXing, custom | Caméras low-end → fallback manuel |

## 5.2 Back-office web

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Web gérant+super-admin | **Next.js + TS** | SSR, écosystème datagrids/charts, i18n | Vue/Nuxt, Angular, SvelteKit | Bundle → code splitting ; RSC avec parcimonie |
| UI | **shadcn/ui + Tailwind** | Accessible (Radix), charte tenant via CSS vars | MUI (lourd), AntD, Chakra | Patterns data-dense à inventer |
| État serveur | **TanStack Query** | Cache/retry/invalidation | Redux (lourd), SWR | — |
| Formulaires | **React Hook Form + Zod** | Typé, partagé avec DTO API | Formik, Yup | — |

## 5.3 API backend

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| API REST+WS modulaire | **NestJS (Node/TS)** | Modules=domaines, DI, guards/pipes, OpenAPI auto, WS natif | Fastify+plugins, Django DRF, Laravel, Go | Node single-thread → workers CPU-bound ; cold start → autoscaling |
| Validation | **Zod / class-validator + DTO** | Contrats typés front/back | Joi | — |
| Temps réel | **Socket.IO** | Rooms tenant, fallback long-polling, Redis adapter | WS natif, SSE, Ably/Pusher (coût) | Redis adapter obligatoire |
| Interne | **Modulaire + events (BullMQ)** | Découplage paiement/paie/notif ; monolithe modulaire | Microservices v1 (sur-ingénierie) | SPOF monolithe → services séparables |

## 5.4 Base de données

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Transactionnel | **PostgreSQL** | ACID, RLS natif, JSONB, EXCLUDE, partitionnement, FTS | MySQL (pas de RLS), Mongo (ACID multi-doc insuffisant), DynamoDB | Noisy neighbor → bascule §4.1 ; PgBouncer requis |
| ORM | **Prisma** (Drizzle si perf) | Typage + migrations sûres | Sequelize, Knex | Requêtes RLS complexes → `$queryRaw` OK |
| Migrations | **Prisma Migrate** en CI | Rejouable, expand/contract | Manuel | Grosses tables → `CONCURRENTLY` |

## 5.5 Cache / files / sessions

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Cache/sessions/verrous/files | **Redis** | Sessions, cache, verrous place, token bucket, **BullMQ**, Socket.IO adapter | Memcached, RabbitMQ/Kafka (sur-dim.), SQS (lock) | SPOF → managed HA + AOF ; perte = re-login (acceptable) |
| Files | **BullMQ** | Node natif, retry/backoff/DLQ, Bull Board, scheduler | Agenda (pas DLQ), Temporal (lourd) | Jobs longs → workers dédiés |

## 5.6 Paiement

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Abstraction | **Pattern Adapter** (`PaymentProvider` : initiate/refund/payout/parseWebhook) | Indépendance, ajout fournisseurs sans refonte, mocks test | SDK unique, Stripe seul (pas de mobile money) | N adaptateurs à maintenir ; specs hétérogènes |
| Fournisseurs v1 | **FedaPay prioritaire + CinetPay secondaire** | FedaPay : mobile money ToGo + SDK mature ; CinetPay : couverture UEMOA, redondance | PayDunya, PayGate, Stripe seul | APIs hétérogènes → normalisation `Transaction` ; webhooks non signés → vérif + allowlist IP |
| Routage | **Scoring** (coût, succès glissant, circuit-breaker) | Bascule auto (E2) | Statique | Biais moins cher → plancher succès 90 % |

## 5.7 Stockage fichiers

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Photos/PDF/exports | **S3-compatible** | Standard, URLs signées, versioning, CDN | FS local, Cloudinary (images seules), base64 DB | Latence upload → URL signée directe client→S3 ; egress → CDN |

## 5.8 AuthN/AuthZ

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| AuthN | **JWT access 15 min + refresh Redis 30 j rotatif** ; OAuth2/OIDC social ; OTP SMS client | Stateless, refresh révocable, social natif | Sessions serveur (affinité), Auth0/Firebase (coût+dépendance) | Vol JWT → rotation + détection ; MFA gérant TOTP/WebAuthn |
| OTP SMS | Passerelle SMS locale | B1 téléphone+OTP | WhatsApp OTP, e-mail seul | Coût → rate-limit + fallback e-mail |
| AuthZ | **RBAC** `role→permission` (`module.action`) | Granularité F2, auditable | ABAC, ACL | Explosion permissions → rôles seedés + custom limités |

## 5.9 Notifications

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Push | **FCM + APNs** via svc-notifications | Standard, gratuit ; fallback email/SMS | OneSignal (dépendance), push custom | Certs APNs + review store ; tokens à rafraîchir |
| SMS | Passerelle SMS locale | Universel ToGo | WhatsApp API, push seul | Coût → groupement, opt-out |
| E-mail | Service tierce transactionnel | Reçus, bulletins | Self-hosted (délivrabilité) | Bulletins = PII → pièce jointe signée |
| Temps réel interne | Socket.IO | — | — | — |

## 5.10 PDF

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Bulletins/tickets/rapports | **HTML→PDF serveur** (Puppeteer worker dédié ; `pdf-lib` tickets simples) | Templates riches, charte tenant, worker isolé | wkhtmltopdf (abandonné), LaTeX, client-side | Chromium lourd → worker dédié + scale séparé ; mentions légales bulletins à valider |

## 5.11 Conteneurisation / déploiement

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Conteneurs | **Docker** multi-stage <200 Mo | Standard, reproductible | Podman, non conteneurisé | Secrets jamais en image → runtime injection |
| Orchestration | **K8s managé** ou équivalent ; **Cloud Run/Fargate si équipe ≤1 DevOps** | HPA, rolling, secrets, multi-AZ | Swarm, VPS nu, Nomad | K8s complexe → serverless au lancement recommandé |
| Réseau | **Nginx/Ingress + cert-manager TLS1.3** ; Cloudflare | TLS, WAF, rate-limit edge | HAProxy, exposition directe | — |
| CDN | CloudFront/Cloudflare pour S3 | Latence images | Sans CDN | — |

## 5.12 CI/CD

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Pipeline | **GitHub Actions** | Intégré, matrix, secrets, écosystème | Jenkins, CircleCI, Bitbucket | Coût minutes Flutter → cache |
| Quality gate | ESLint+Prettier+`tsc`+tests (coverage ≥70 %) + `flutter analyze/test` + `npm audit`/`osv-scanner` | Exigence CDC §4 | Sans gate | Coverage legacy = illusions → par module |
| Déploiement | CD : image → registry → canary/blue-green → smoke → rollback auto | Zéro downtime | Manuel | Migrations expand/contract |

## 5.13 Observabilité

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Logs | **Loki + Vector/Promtail** | Coût, labels tenant/service | ELK (lourd), CloudWatch (lock) | Rétention = coût → S3 |
| Métriques | **Prometheus + Grafana** | CNCF, alertmanager | Datadog (coût), InfluxDB | Cardinalité : `tenant_id` OK, `user_id` interdit |
| Traces | **OTel → Tempo/Jaeger** | Vendor-neutral W3C | Zipkin, APM vendor | Sampling 10 % nominal / 100 % erreurs |
| Erreurs | **Sentry** (3 fronts) | Releases, symbolication Dart | Rollbar, Bugsnag | Coût → sampling + PII scrub |
| Uptime | UptimeRobot + smoke tests | Détection externe | Auto seul | — |

## 5.14 Tests

| Besoin | Retenu | Justification | Écarté | Risques |
|---|---|---|---|---|
| Backend | **Jest/Vitest + Supertest + Testcontainers (PG/Redis réels)** | Vraies dépendances → confiance RLS/paiements | Mocks DB, SQLite mémoire | Lent → parallèle CI |
| Web | **Vitest + Testing Library + Playwright** | E2E parcours critique | Cypress, Selenium | Flakiness → retry/quarantaine |
| Mobile | **`flutter_test` + `integration_test` + Patrol** | E2E device/émulateur | Appium, manuel only | Émulateurs CI → Firebase Test Lab |
| Charge | **k6** | JS, thresholds, cloud | JMeter, Gatling | — |
| Sécu | `npm audit` + `osv-scanner` + ZAP + pentest annuel | CDC §5.3 | Manuel seul | — |

## 5.15 Remises en cause du CDC

| Choix CDC | Verdict |
|---|---|
| Flutter, Next.js, NestJS, PostgreSQL+RLS, Redis, BullMQ, Socket.IO, S3, Docker, GH Actions, Prometheus/Grafana, Sentry | **Confirmés** |
| Kubernetes | **Nuancé** : Cloud Run/Fargate/GKE Autopilot si DevOps ≤1 ; K8s complet >50 tenants |
| Meilisearch/Elasticsearch | **Différé** : FTS PostgreSQL suffit ~1 M produits |
| Stripe | **Option v2** : inutile tant que mobile money prioritaire |
