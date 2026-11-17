# Tablya — Livrable 6 : Sécurité et conformité

## 6.1 Chiffrement

| Couche | Mesure |
|---|---|
| Transit | **TLS 1.3** obligatoire ; HSTS ; LB/ingress ; mTLS interne optionnel |
| Repos | **AES-256** : volume managé chiffré ; colonnes sensibles (`employe.coordonnee_paiement`, PII) via `pgcrypto`/app-level ; S3 SSE-KMS ; Redis `requirepass`+TLS ; backups chiffrés |
| Mots de passe | **Argon2id** (ou bcrypt ≥12) + pepper coffre |
| JWT | Access 15 min (EdDSA/RS256), refresh rotatif 30 j hashé Redis, détection réutilisation → révocation famille |
| QR tables | `qr_token` opaque 128 bits, révocable/rotatif |

## 6.2 Secrets

Coffre managé (Secrets Manager / Vault) : clés API FedaPay/CinetPay/Stripe, HMAC webhooks, DB, Redis, JWT key — rotation 90–180 j + immédiate si suspicion. Injection runtime (jamais en image/env commité). `gitleaks`/`git-secrets` pre-commit + CI. Dev ≠ prod.

## 6.3 MFA gérants

Obligatoire `gerant` + tout rôle financier (`paie.approuver`, `paiement.rembourser`, `portefeuille.retirer`) : TOTP + WebAuthn optionnel. **Step-up auth** : actions sensibles exigent re-auth MFA <5 min. Codes de secours hashés ; reset via super-admin audité. Employés : PIN court-terme cantonné au pointage.

## 6.4 Webhooks

| Fournisseur | Mécanisme |
|---|---|
| FedaPay | HMAC-SHA256 + secret webhook ; `timingSafeEqual` ; timestamp ±5 min ; allowlist IP |
| CinetPay | Clé secrète + signature ; idem |
| Stripe (option) | `Stripe-Signature` v1 + SDK `constructEvent` |

Jamais de traitement non vérifié ; idempotence `payment_event` ; rate-limit strict + payload max + logs de rejet ; test de rejeu en CI.

## 6.5 Paie — double validation

1. `paie.preparer` → `brouillon → valide` ;
2. `paie.approuver` **distincte** + MFA fraîche + `approved_by` ; **interdiction même utilisateur** sur le même lot ;
3. Batch idempotent ; `paiement_salaire` rejouable avec audit.

## 6.6 OWASP Top 10 (2021)

| Risque | Mesure |
|---|---|
| A01 Access Control | RBAC + RLS ; deny-by-default ; tests cross-tenant CI ; UUID non séquentiels ; pas d'IDOR |
| A02 Crypto | TLS1.3, AES-256, Argon2id, coffre |
| A03 Injection | Requêtes paramétrées ; Zod DTO sur toutes entrées |
| A04 Insecure Design | Threat modeling paiement/paie/auth ; abuse cases (double paiement, fraude pourboire) |
| A05 Misconfig | CORS whitelist tenant, headers sécurité, pas de stack traces, admin sur chemin dédié + IP allowlist optionnelle |
| A06 Components | `npm audit`/`osv-scanner` bloquant HIGH/CRITICAL ; Dependabot ; SBOM ; revue trimestrielle |
| A07 Auth | MFA gérants, rate-limit login, verrouillage progressif, OTP unique 5 min |
| A08 Integrity | Webhooks signés, `idempotency_key`, immutabilité audit/transaction, CI/CD signé |
| A09 Logging | JSON §2 ; audit immuable ; alertes `auth_login_failures`, `signature_invalid` |
| A10 SSRF | Allowlist domaines webhooks/exports ; blocage metadata cloud 169.254.169.254 |

## 6.7 PCI DSS — périmètre réduit

Aucun PAN/CVV stocké → **SAQ A**. Champs carte tokenisés côté agrégateur ; 3-D Secure ; AOC fournisseurs collectées contractuellement ; revue annuelle SAQ A.

## 6.8 Données personnelles (loi 2019-014 / RGPD)

Registre des traitements ; `GET /rgpd/export` (JSON/CSV, 30 j) ; effacement = anonymisation (conservation obligations) ; opt-in marketing + opt-out 1 clic ; journal consentement ; minimisation ; privacy by design ; DPO si seuil (à évaluer) ; violation → 72 h ; transferts hors ToGo documentés (hébergement UE préférable).

## 6.9 Pentest

| Phase | Contenu | Quand |
|---|---|---|
| Auto | `npm audit`, ZAP baseline, Trivy/Grype | Continu CI |
| Externe | Prestataire certifié : auth, API, isolation multi-tenant, paiements, paie | Avant prod + annuel |
| Scénarios | IDOR cross-tenant, webhook forgé/replay, élévation RBAC, injection, brute force OTP, vol session | Chaque release majeure |
| Bug bounty | HackerOne/YesWeHack | v1.1 |
| Revue code | Checklist OWASP PR modules sensibles + `security-reviewer` | Continu |
