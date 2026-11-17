# Tablya — Livrable 3 : Responsivité et ergonomie

## 3.1 Application mobile (Flutter)

### Stratégie

| Aspect | Décision |
|---|---|
| Codebase | Une seule Flutter pour Android+iOS ; `flutter_adaptive_scaffold`/`NavigationRail` tablette |
| Breakpoints | Compact <600dp · Medium 600–839dp · Expanded ≥840dp (Material 3 WindowSizeClass) |
| Orientation | Portrait prioritaire espace client ; paysage autorisé écrans pro (KDS, caisse, plan de salle) deux panneaux |
| Tailles testées | 320×568, 360×800, 390×844, 768×1024, 1024×1366, 800×1280 |
| Densité | Tokens 4/8/16/24 dp ; jamais px fixes ; `devicePixelRatio` respecté |

### Parcours client < 5 écrans

`Scan QR → Menu → Panier → Paiement → Suivi`

| Écran | Contenu | Contraintes |
|---|---|---|
| Scan QR | Caméra native `mobile_scanner`, fallback saisie manuelle | Permission expliquée avant demande |
| Menu | Chips catégories sticky, cartes plats (photo/nom/prix/dispo), panier flottant | Images WebP ≤100 Ko lazy ; `5 000 FCFA` ; rupture "Épuisé" |
| Panier | Lignes modifiables, suppléments, promo, mode (sur place/emporter/livraison) | Cibles ≥48 dp ; CTA sticky total |
| Paiement | TMoney/Moov/Carte, pourboire 0/5/10 %, partage N parts, promo | Instructions USSD plein écran ; états `en_attente` |
| Suivi | Timeline reçue→préparation→prête→servie + push | Couleur+icône+texte |

### Espace personnel

| Profil | Écrans | Optimisation |
|---|---|---|
| Serveur | Plan de salle, commande, transfert | Grille ≥96 dp/cellule ; ajout article ≤2 touches ; swipe actions |
| Caissier | Caisse, encaissement, clôture | Pavé numérique ; confirmation annulation ; sombre par défaut |
| Manager | Dashboard occupation, validations | Badge alertes ; validation 1 tap + motif |
| Employé | Planning, pointage PIN/QR/GPS, bulletin | Pointage <3 s |

### Mode sombre

Obligatoire : thèmes light/dark/system (Material 3 `ColorScheme.fromSeed`). Client = suit système ; écrans pro = sombre forcé. Contraste ≥4,5:1 vérifié sur les deux thèmes.

## 3.2 Back-office web (Next.js)

### Breakpoints

| BP | Plage | Usage |
|---|---|---|
| xs | <640px | Lecture + actions essentielles |
| sm | 640–768px | Phablette |
| md | 768–1024px | Sidebar collapsible, formulaires 1 col. |
| lg | 1024–1280px | Sidebar fixe, tableaux complets |
| xl | ≥1280px | Multi-panneaux |

Grille CSS 12 col. ; composants `PageHeader`, `DataTable`, `StatCard`, `FilterBar`, `FormSection` (shadcn/ui + Tailwind). Tableaux : colonnes secondaires repliées sous `md` (row expansion) ; tri/filtres conservés ; pagination serveur. Charte tenant injectée en CSS variables scopées (A5). i18n `next-intl` FR+EN. WCAG 2.2 AA.

## 3.3 Écrans cuisine/caisse (KDS)

- Tablette 10–12" paysage, navigateur plein écran (PWA kiosk possible)
- **Mode sombre forcé**, texte ≥18 px, tickets ≥48 px/ligne
- Alertes sonores optionnelles + visuelles (couleur + icône + badge "NOUVEAU")
- Ajout panier ≤2 s, validation ticket ≤1 tap ; raccourcis clavier caissier
- ESC/POS Bluetooth/réseau : ticket cuisine auto à l'envoi, ticket caisse au paiement ; file d'impression locale + retry
- Socket.IO rooms `tenant:{id}:cuisine|bar|caisse` — routing par `ligne_commande.poste_cible`

## 3.4 Performance perçue — objectifs mesurables

| Objectif | Cible | Moyen |
|---|---|---|
| Menu affiché | < 2 s sur 3G (~1,6 Mbps) | WebP/AVIF ≤100 Ko lazy, cache Redis 60 s, gzip/brotli, squelettes |
| Scan QR → menu | < 3 s | 1 appel groupé place+menu |
| Ajout → KDS | < 2 s | Socket.IO + index `(tenant_id, statut)` |
| Premier rendu app | < 2 s froid | Feature splitting, démarrage différé |
| Dashboard back-office | < 3 s | Agrégats `daily_stats` + cache Redis 5 min |
| Hors ligne | 100 % actions pro | Outbox SQLite (§1.11), menu/plans cachés |

Réseau dégradé : timeout adaptatif, retry exp. + jitter, file locale, mode lecture seule, bannière réseau explicite.

## 3.5 Accessibilité (WCAG 2.2 AA)

Contraste ≥4,5:1 (clair+sombre) ; cibles ≥48 dp mobile / ≥44 px web ; base 16 sp, jamais <12 ; jamais la couleur seule ; focus visible + navigation clavier ; `Semantics` Flutter / ARIA web ; `prefers-reduced-motion` respecté.
