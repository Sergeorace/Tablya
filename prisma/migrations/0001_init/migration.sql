-- CreateEnum
CREATE TYPE "EtablissementStatut" AS ENUM ('en_attente', 'actif', 'suspendu', 'rejete');

-- CreateEnum
CREATE TYPE "IsolationNiveau" AS ENUM ('shared', 'dedicated');

-- CreateEnum
CREATE TYPE "PlanAbonnement" AS ENUM ('starter', 'pro', 'entreprise');

-- CreateEnum
CREATE TYPE "AbonnementStatut" AS ENUM ('essai', 'actif', 'impaye', 'suspendu', 'resilie');

-- CreateEnum
CREATE TYPE "PeriodeAbonnement" AS ENUM ('mensuel', 'annuel');

-- CreateEnum
CREATE TYPE "PlaceStatut" AS ENUM ('libre', 'reservee', 'occupee', 'addition', 'nettoyage', 'hors_service');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('table', 'comptoir', 'canape', 'loge');

-- CreateEnum
CREATE TYPE "ReservationStatut" AS ENUM ('en_attente', 'confirmee', 'annulee', 'no_show', 'honoree');

-- CreateEnum
CREATE TYPE "CommandeType" AS ENUM ('sur_place', 'emporter', 'livraison', 'precommande');

-- CreateEnum
CREATE TYPE "CommandeStatut" AS ENUM ('recue', 'en_preparation', 'prete', 'servie', 'cloturee', 'annulee');

-- CreateEnum
CREATE TYPE "LigneStatut" AS ENUM ('en_attente', 'envoye_cuisine', 'en_cours', 'pret', 'serve', 'annulee');

-- CreateEnum
CREATE TYPE "PosteCible" AS ENUM ('cuisine', 'bar', 'caisse');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('paiement', 'refund', 'payout', 'abonnement');

-- CreateEnum
CREATE TYPE "TransactionStatut" AS ENUM ('initiee', 'en_attente', 'reussie', 'echouee', 'expiree', 'annulee', 'partiellement_payee', 'remboursee_partiellement', 'remboursee');

-- CreateEnum
CREATE TYPE "FournisseurPaiement" AS ENUM ('fedapay', 'cinetpay', 'stripe', 'especes', 'virement');

-- CreateEnum
CREATE TYPE "PartageStatut" AS ENUM ('en_attente', 'reussi', 'echoue', 'rembourse');

-- CreateEnum
CREATE TYPE "ReversementStatut" AS ENUM ('planifie', 'en_cours', 'reussi', 'echoue');

-- CreateEnum
CREATE TYPE "ReversementMode" AS ENUM ('instantane', 'lot');

-- CreateEnum
CREATE TYPE "ReversementDestination" AS ENUM ('mobile_money', 'banque');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('initiate', 'webhook', 'refund', 'payout', 'reconcile');

-- CreateEnum
CREATE TYPE "PaymentEventStatut" AS ENUM ('received', 'processed', 'duplicate', 'rejected', 'error');

-- CreateEnum
CREATE TYPE "BulletinStatut" AS ENUM ('brouillon', 'valide', 'approuve', 'paye', 'annule');

-- CreateEnum
CREATE TYPE "PaiementSalaireStatut" AS ENUM ('planifie', 'en_cours', 'reussi', 'echoue', 'a_rejouer');

-- CreateEnum
CREATE TYPE "PointageMethode" AS ENUM ('pin', 'qr', 'gps', 'manuel');

-- CreateEnum
CREATE TYPE "PointageStatut" AS ENUM ('present', 'absent', 'retard');

-- CreateEnum
CREATE TYPE "AvisStatut" AS ENUM ('publie', 'masque');

-- CreateTable
CREATE TABLE "groupe" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "groupe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etablissement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "groupe_id" TEXT,
    "raison_sociale" TEXT NOT NULL,
    "rccm" TEXT,
    "nif" TEXT,
    "slug" TEXT NOT NULL,
    "statut" "EtablissementStatut" NOT NULL DEFAULT 'en_attente',
    "isolation_level" "IsolationNiveau" NOT NULL DEFAULT 'shared',
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "langues" TEXT[] DEFAULT ARRAY['fr']::TEXT[],
    "charte_graphique" JSONB,
    "horaires" JSONB,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "mot_de_passe_hash" TEXT,
    "mfa_actif" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "email_verifie" BOOLEAN NOT NULL DEFAULT false,
    "telephone_verifie" BOOLEAN NOT NULL DEFAULT false,
    "dernier_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "etablissement_id" TEXT,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "systeme" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "employe" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "telephone" TEXT,
    "coordonnee_paiement" TEXT,
    "pointage_pin_hash" TEXT,
    "salaire_base_centimes" BIGINT,
    "statut_contrat" TEXT,
    "date_embauche" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "nom" TEXT,
    "langue_preferee" TEXT NOT NULL DEFAULT 'fr',
    "niveau_fidelite" TEXT NOT NULL DEFAULT 'standard',
    "tenant_id_dernier" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capacite_defaut" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "capacite" INTEGER NOT NULL DEFAULT 4,
    "type" "PlaceType" NOT NULL DEFAULT 'table',
    "statut" "PlaceStatut" NOT NULL DEFAULT 'libre',
    "commande_active_id" TEXT,
    "qr_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "place_id" TEXT,
    "client_id" TEXT NOT NULL,
    "creneau_debut" TIMESTAMP(3) NOT NULL,
    "creneau_fin" TIMESTAMP(3) NOT NULL,
    "nb_personnes" INTEGER NOT NULL,
    "statut" "ReservationStatut" NOT NULL DEFAULT 'confirmee',
    "rappel_envoye_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorie" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "categorie_id" TEXT,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "photo_url" TEXT,
    "allergenes" JSONB,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "prix_par_plage" JSONB,
    "menu_compose" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variante" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prix_centimes" BIGINT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "variante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commande" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "place_id" TEXT,
    "client_id" TEXT,
    "serveur_id" TEXT,
    "type" "CommandeType" NOT NULL DEFAULT 'sur_place',
    "statut" "CommandeStatut" NOT NULL DEFAULT 'recue',
    "mode_paiement_prevu" TEXT,
    "total_centimes" BIGINT NOT NULL DEFAULT 0,
    "idempotency_key" UUID NOT NULL,
    "metadata_hors_ligne" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_commande" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "variante_id" TEXT,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "prix_unitaire_centimes" BIGINT NOT NULL,
    "total_centimes" BIGINT NOT NULL,
    "supplements" JSONB,
    "statut" "LigneStatut" NOT NULL DEFAULT 'en_attente',
    "poste_cible" "PosteCible" NOT NULL DEFAULT 'cuisine',
    "parent_ligne_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "commande_id" TEXT,
    "portefeuille_id" TEXT,
    "fournisseur" "FournisseurPaiement" NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'paiement',
    "reference_externe" TEXT,
    "statut" "TransactionStatut" NOT NULL DEFAULT 'initiee',
    "montant_centimes" BIGINT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "commission_plateforme_centimes" BIGINT NOT NULL DEFAULT 0,
    "frais_fournisseur_centimes" BIGINT NOT NULL DEFAULT 0,
    "net_etablissement_centimes" BIGINT NOT NULL DEFAULT 0,
    "idempotency_key" UUID NOT NULL,
    "reponse_fournisseur" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partage_paiement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL DEFAULT 'convive',
    "montant_centimes" BIGINT NOT NULL,
    "statut" "PartageStatut" NOT NULL DEFAULT 'en_attente',
    "reference_externe" TEXT,

    CONSTRAINT "partage_paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portefeuille" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "solde_centimes" BIGINT NOT NULL DEFAULT 0,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portefeuille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reversement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "portefeuille_id" TEXT NOT NULL,
    "montant_centimes" BIGINT NOT NULL,
    "statut" "ReversementStatut" NOT NULL DEFAULT 'planifie',
    "mode" "ReversementMode" NOT NULL DEFAULT 'lot',
    "destination" "ReversementDestination" NOT NULL DEFAULT 'mobile_money',
    "reference_externe" TEXT,
    "execute_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reversement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_event" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "fournisseur" "FournisseurPaiement" NOT NULL,
    "type" "PaymentEventType" NOT NULL,
    "reference_externe" TEXT,
    "payload_hash" TEXT,
    "statut" "PaymentEventStatut" NOT NULL DEFAULT 'received',
    "http_status" INTEGER,
    "duree_ms" INTEGER,
    "erreur_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pointage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employe_id" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "heure_arrivee" TIMESTAMP(3),
    "heure_depart" TIMESTAMP(3),
    "methode" "PointageMethode" NOT NULL DEFAULT 'pin',
    "statut" "PointageStatut" NOT NULL DEFAULT 'present',
    "planning_id" TEXT,

    CONSTRAINT "pointage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employe_id" TEXT NOT NULL,
    "jour" DATE NOT NULL,
    "debut" TIME NOT NULL,
    "fin" TIME NOT NULL,
    "poste" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'planifie',

    CONSTRAINT "planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_paie" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employe_id" TEXT NOT NULL,
    "periode_annee" INTEGER NOT NULL,
    "periode_mois" INTEGER NOT NULL,
    "brut_centimes" BIGINT NOT NULL DEFAULT 0,
    "net_centimes" BIGINT NOT NULL DEFAULT 0,
    "cotisations_centimes" BIGINT NOT NULL DEFAULT 0,
    "impots_centimes" BIGINT NOT NULL DEFAULT 0,
    "primes_centimes" BIGINT NOT NULL DEFAULT 0,
    "retenues_centimes" BIGINT NOT NULL DEFAULT 0,
    "heures_sup_centimes" BIGINT NOT NULL DEFAULT 0,
    "heures_sup_minutes" INTEGER NOT NULL DEFAULT 0,
    "statut" "BulletinStatut" NOT NULL DEFAULT 'brouillon',
    "validated_by" TEXT,
    "pdf_url" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement_salaire" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bulletin_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "montant_centimes" BIGINT NOT NULL,
    "statut" "PaiementSalaireStatut" NOT NULL DEFAULT 'planifie',
    "reference_externe" TEXT,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "paiement_salaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametre_paie" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cotisation_salariale_bp" INTEGER NOT NULL DEFAULT 0,
    "impot_bp" INTEGER NOT NULL DEFAULT 0,
    "heures_sup_bp" INTEGER NOT NULL DEFAULT 5000,
    "minutes_mensuelles" INTEGER NOT NULL DEFAULT 12480,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametre_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "fournisseur_id" TEXT,
    "quantite" BIGINT NOT NULL DEFAULT 0,
    "seuil_alerte" BIGINT NOT NULL DEFAULT 0,
    "unite" TEXT NOT NULL DEFAULT 'unite',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "coordonnees" TEXT,
    "telephone" TEXT,

    CONSTRAINT "fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avis" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "commande_id" TEXT,
    "note" INTEGER NOT NULL DEFAULT 5,
    "commentaire" TEXT,
    "reponse_gerant" TEXT,
    "statut" "AvisStatut" NOT NULL DEFAULT 'publie',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonnement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "plan" "PlanAbonnement" NOT NULL,
    "statut" "AbonnementStatut" NOT NULL DEFAULT 'essai',
    "debut" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" DATE,
    "montant_centimes" BIGINT NOT NULL DEFAULT 0,
    "periode" "PeriodeAbonnement" NOT NULL DEFAULT 'mensuel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fidelite" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "etablissement_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "niveau" TEXT NOT NULL DEFAULT 'standard',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fidelite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "utilisateur_id" TEXT,
    "client_id" TEXT,
    "canal" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "lue_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "utilisateur_id" TEXT,
    "etablissement_id" TEXT,
    "action" TEXT NOT NULL,
    "entite_type" TEXT NOT NULL,
    "entite_id" UUID NOT NULL,
    "avant" JSONB,
    "apres" JSONB,
    "motif" TEXT,
    "ip" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etablissement_tenant_id_key" ON "etablissement"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "etablissement_slug_key" ON "etablissement"("slug");

-- CreateIndex
CREATE INDEX "utilisateur_etablissement_id_idx" ON "utilisateur"("etablissement_id");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_tenant_id_email_key" ON "utilisateur"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_tenant_id_telephone_key" ON "utilisateur"("tenant_id", "telephone");

-- CreateIndex
CREATE UNIQUE INDEX "role_tenant_id_code_key" ON "role"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employe_utilisateur_id_key" ON "employe"("utilisateur_id");

-- CreateIndex
CREATE INDEX "employe_etablissement_id_idx" ON "employe"("etablissement_id");

-- CreateIndex
CREATE UNIQUE INDEX "employe_tenant_id_telephone_key" ON "employe"("tenant_id", "telephone");

-- CreateIndex
CREATE UNIQUE INDEX "client_telephone_key" ON "client"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "zone_etablissement_id_nom_key" ON "zone"("etablissement_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "place_qr_token_key" ON "place"("qr_token");

-- CreateIndex
CREATE INDEX "place_etablissement_id_statut_idx" ON "place"("etablissement_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "place_tenant_id_numero_key" ON "place"("tenant_id", "numero");

-- CreateIndex
CREATE INDEX "reservation_etablissement_id_creneau_debut_idx" ON "reservation"("etablissement_id", "creneau_debut");

-- CreateIndex
CREATE UNIQUE INDEX "categorie_etablissement_id_nom_key" ON "categorie"("etablissement_id", "nom");

-- CreateIndex
CREATE INDEX "produit_etablissement_id_disponible_idx" ON "produit"("etablissement_id", "disponible");

-- CreateIndex
CREATE UNIQUE INDEX "commande_idempotency_key_key" ON "commande"("idempotency_key");

-- CreateIndex
CREATE INDEX "commande_tenant_id_statut_created_at_idx" ON "commande"("tenant_id", "statut", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commande_etablissement_id_statut_idx" ON "commande"("etablissement_id", "statut");

-- CreateIndex
CREATE INDEX "ligne_commande_commande_id_idx" ON "ligne_commande"("commande_id");

-- CreateIndex
CREATE INDEX "ligne_commande_tenant_id_statut_idx" ON "ligne_commande"("tenant_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_reference_externe_key" ON "transaction"("reference_externe");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_idempotency_key_key" ON "transaction"("idempotency_key");

-- CreateIndex
CREATE INDEX "transaction_tenant_id_statut_idx" ON "transaction"("tenant_id", "statut");

-- CreateIndex
CREATE INDEX "transaction_etablissement_id_created_at_idx" ON "transaction"("etablissement_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portefeuille_etablissement_id_key" ON "portefeuille"("etablissement_id");

-- CreateIndex
CREATE INDEX "payment_event_transaction_id_created_at_idx" ON "payment_event"("transaction_id", "created_at");

-- CreateIndex
CREATE INDEX "pointage_tenant_id_employe_id_idx" ON "pointage"("tenant_id", "employe_id");

-- CreateIndex
CREATE INDEX "planning_tenant_id_employe_id_jour_idx" ON "planning"("tenant_id", "employe_id", "jour");

-- CreateIndex
CREATE UNIQUE INDEX "bulletin_paie_tenant_id_employe_id_periode_annee_periode_mo_key" ON "bulletin_paie"("tenant_id", "employe_id", "periode_annee", "periode_mois");

-- CreateIndex
CREATE UNIQUE INDEX "parametre_paie_tenant_id_key" ON "parametre_paie"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_etablissement_id_produit_id_key" ON "stock"("etablissement_id", "produit_id");

-- CreateIndex
CREATE UNIQUE INDEX "fidelite_tenant_id_client_id_etablissement_id_key" ON "fidelite"("tenant_id", "client_id", "etablissement_id");

-- CreateIndex
CREATE INDEX "notification_utilisateur_id_lue_at_idx" ON "notification"("utilisateur_id", "lue_at");

-- CreateIndex
CREATE INDEX "notification_client_id_lue_at_idx" ON "notification"("client_id", "lue_at");

-- CreateIndex
CREATE INDEX "notification_tenant_id_type_idx" ON "notification"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entite_type_entite_id_idx" ON "audit_log"("entite_type", "entite_id");

-- AddForeignKey
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_groupe_id_fkey" FOREIGN KEY ("groupe_id") REFERENCES "groupe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employe" ADD CONSTRAINT "employe_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employe" ADD CONSTRAINT "employe_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone" ADD CONSTRAINT "zone_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place" ADD CONSTRAINT "place_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place" ADD CONSTRAINT "place_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorie" ADD CONSTRAINT "categorie_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variante" ADD CONSTRAINT "variante_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commande" ADD CONSTRAINT "ligne_commande_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_portefeuille_id_fkey" FOREIGN KEY ("portefeuille_id") REFERENCES "portefeuille"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partage_paiement" ADD CONSTRAINT "partage_paiement_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portefeuille" ADD CONSTRAINT "portefeuille_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversement" ADD CONSTRAINT "reversement_portefeuille_id_fkey" FOREIGN KEY ("portefeuille_id") REFERENCES "portefeuille"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_employe_id_fkey" FOREIGN KEY ("employe_id") REFERENCES "employe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning" ADD CONSTRAINT "planning_employe_id_fkey" FOREIGN KEY ("employe_id") REFERENCES "employe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_paie" ADD CONSTRAINT "bulletin_paie_employe_id_fkey" FOREIGN KEY ("employe_id") REFERENCES "employe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_salaire" ADD CONSTRAINT "paiement_salaire_bulletin_id_fkey" FOREIGN KEY ("bulletin_id") REFERENCES "bulletin_paie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_salaire" ADD CONSTRAINT "paiement_salaire_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement" ADD CONSTRAINT "abonnement_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fidelite" ADD CONSTRAINT "fidelite_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fidelite" ADD CONSTRAINT "fidelite_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

