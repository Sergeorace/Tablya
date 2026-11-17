# Tablya — Livrable 7 : Plan de réalisation

## 7.1 Épopées et estimations

| # | Épopée | Modules | Estimation |
|---|---|---|---|
| E0 | Cadrage & fondations | — | 15 j |
| E1 | Socle multi-tenant & auth | A, F | 30 j |
| E2 | Catalogue & plan de salle | C, D1 | 25 j |
| E3 | Commandes & POS | B4–B6, D3–D7 | 35 j |
| E4 | Paiement & portefeuille | B7, E | 40 j |
| E5 | Réservations & expérience client | B1–B3, B5, B8–B10 | 30 j |
| E6 | Équipe, plannings & pointage | F3–F6 | 20 j |
| E7 | Paie | G | 30 j |
| E8 | Pilotage & super-admin | H, I, A6 | 30 j |
| E9 | Notifications | J | 15 j |
| E10 | Durcissement & recette | §4–§6 | 25 j |

**Total v1 : ~295 j-h** (12–14 mois avec équipe CDC §9 ; **MVP = E0→E4 ≈ 145 j ≈ 5–6 mois**).

## 7.2 User stories (critères d'acceptation)

### E1 — Socle & auth
- **US-1.1 Inscription** : formulaire + pièces → `etablissement en_attente` + `abonnement essai` + compte `gerant` ; e-mail confirmation ; rien de visible côté client.
- **US-1.2 Validation** : super-admin valide KYC → `actif` en transaction + RLS + e-mail ; rejet = motif audité.
- **US-1.3 Isolation** : ressource tenant B avec JWT tenant A → 403/404 (test CI).
- **US-1.4 MFA** : gérant configure TOTP ; actions financières exigent re-auth <5 min.

### E2 — Catalogue & salle
- **US-2.1 Numérotation** : `ETAB-ZONE-NNN` généré ; doublon rejeté `UNIQUE(tenant_id,numero)` ; QR unique imprimable.
- **US-2.2 Plan de salle** : glisser-déposer ; statuts temps réel ; fusion/transfert.
- **US-2.3 Catalogue** : CRUD catégories/produits/variantes/options ; prix par plage ; photo ≤100 Ko ; dispo propagée <2 s.

### E3 — Commandes & POS
- **US-3.1 Scan QR** : scan → menu <3 s → commande `recue` sur KDS <2 s.
- **US-3.2 Hors ligne** : commande locale → sync au retour ; conflit → résolution ; 0 perte.
- **US-3.3 Caisse** : encaissement multi-mode ; remise motif+permission ; clôture avec écart tracé.

### E4 — Paiement
- **US-4.1 TMoney** : USSD → webhook signé → `reussie` + `cloturee` + reçu ; webhook dupliqué = no-op ; <30 s.
- **US-4.2 Bascule** : FedaPay échec >seuil → CinetPay pour moyens supportés ; client informé sinon.
- **US-4.3 Partage** : 20 000 XOF / 4 → clôture à 100 % ; échec → relance ou bascule total.
- **US-4.4 Reversement** : J+1 (ou J+0) ; commission ventilée ; réconciliation horaire → écart = alerte.

### E5 — Client
- **US-5.1 Réservation** : créneau bloqué (EXCLUDE) ; rappel SMS J-2h ; no-show.
- **US-5.2 Suivi** : timeline + push <2 s.
- **US-5.3 Fidélité** : points/niveaux/offres, opt-in.

### E6 — Équipe
- **US-6.1 RBAC** : rôle custom "barman" permissions fines ; audit `role.modifier`.
- **US-6.2 Pointage** : PIN/QR/GPS <3 s ; planning lié ; correction tracée.

### E7 — Paie
- **US-7.1 Calcul** : cron → `bulletin_paie` + PDF S3 ; erreur → `brouillon`.
- **US-7.2 Double validation** : préparation puis approbation MFA par **autre** utilisateur.
- **US-7.3 Virement** : batch par bulletin ; échec → `a_rejouer` ; notification + PDF.

### E8 — Pilotage
- **US-8.1 Abonnement** : plans ; essai 14 j ; impayé → suspension ; facturation tracée.
- **US-8.2 Dashboard** : CA, panier moyen, occupation, top produits ; exports PDF/Excel.
- **US-8.3 Supervision** : KYC, litiges, métriques §2.6.1, suspension.

## 7.3 Dépendances

```
E0 → E1 → E2 → E3 → E4 → E5
         │    │    │
         └────┴────┴──→ E6 → E7 → E8
E9 transverse dès E3 ; E10 final
```

Bloquants externes : contrats FedaPay+CinetPay (E4), SMS locale (E1/E5), AOC PCI (E4), cotisations ToGo (E7), comptes stores (soumission E10, 2–3 sem avant).

## 7.4 MVP

**Inclus** : E0, E1 (TOTP simple), E2 (places+QR+catalogue basique), E3 (commande+KDS+caisse espèces), E4 (FedaPay seul, total, J+1), E5 partiel (menu+scan+suivi), E9 partiel (push+SMS OTP).
**Exclu** : partage, fidélité, plannings/pointage, paie, marketing, multi-sites, hors ligne complet, CinetPay, rapports avancés.
**Sortie MVP** : 3 pilotes onboardés ; scan→commande→TMoney en prod ; 0 fuite cross-tenant ; p95 <500 ms.

## 7.5 Risques

| Risque | P | I | Mesure |
|---|---|---|---|
| Contrat agrégateur retardé | M | Critique | Signer E0 ; mocks adapters E1 ; webhook FedaPay sem. 2 |
| Cotisations ToGo imprécises | H | Élevé | Expert-comptable E0 ; taux en config |
| Rejet stores | M | Élevé | Soumission anticipée ; règles dès E5 |
| Sync instable | H | Moyen | Hors ligne dès E3 ; E2E CI |
| Équipe < CDC §9 | M | Élevé | MVP strict ; E6–E8 → v1.1 |
| Latence cloud→ToGo | M | Moyen | Test latence E0 ; Abidjan/CDN ; hors ligne |
| Coûts SMS/push | F | Moyen | Rate-limit + quotas plan + monitoring |
