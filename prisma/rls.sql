-- =====================================================================
-- Tablya — Row-Level Security PostgreSQL
-- Exécuté après `prisma migrate deploy` (voir infra/docker-compose.yml
-- qui le monte dans docker-entrypoint-initdb.d pour le dev local).
--
-- Principe : le middleware NestJS exécute `SET app.tenant_id` en début
-- de requête (transaction) depuis le JWT vérifié. Les policies filtrent
-- automatiquement toutes les lignes hors tenant.
-- =====================================================================

-- Rôle applicatif sans BYPASSRLS (mot de passe à remplacer en prod)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tablya_app') THEN
    CREATE ROLE tablya_app LOGIN PASSWORD 'tablya_app_dev';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO tablya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tablya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tablya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tablya_app;

-- Tables globales (registre plateforme, sans RLS) :
--   permission (référentiel), audit_log plateforme géré applicativement
-- Toutes les autres tables métier reçoivent tenant_id + RLS.

-- Liste des tables tenant-scopées (miroir du schéma Prisma)
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'groupe','etablissement','utilisateur','role','role_permission',
    'employe','zone','place','reservation','categorie','produit',
    'variante','commande','ligne_commande','transaction',
    'partage_paiement','portefeuille','reversement','payment_event',
    'pointage','planning','bulletin_paie','paiement_salaire',
    'stock','fournisseur','avis','abonnement','fidelite','audit_log',
    'notification','parametre_paie'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Activer RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- Policy : le tenant courant ne voit que ses lignes.
    -- Exception : tables de registre lues par le contexte public
    -- (etablissement via slug) — policy dédiée plus bas.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END
$$;

-- Tables sans colonne tenant_id propre mais liées à un tenant :
--   client (identité globale) : pas de RLS — accès via jointures
--   permission : référentiel global, pas de RLS
--   role.tenant_id nullable (rôles système partagés) : policy adaptée

DROP POLICY IF EXISTS role_tenant_or_system ON role;
CREATE POLICY role_tenant_or_system ON role
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)
  );

-- etablissement : PAS de lecture publique large. Les lookups publics
-- (slug → tenant, menu, QR, réservations) passent par le client
-- privilégié `platform()` / connexion superuser — la RLS stricte
-- `tenant_isolation` suffit pour tout le chemin applicatif avecTenant.
DROP POLICY IF EXISTS etablissement_public_read ON etablissement;

-- Immuabilité de audit_log (append-only)
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_log;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Index critiques (complémentaires aux index Prisma)
CREATE INDEX IF NOT EXISTS idx_commande_tenant_statut ON commande (tenant_id, statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_tenant_statut ON transaction (tenant_id, statut);
-- (place(tenant_id,numero) déjà couvert par @@unique Prisma — pas de doublon)
CREATE UNIQUE INDEX IF NOT EXISTS idx_commande_idempotency ON commande (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletin_periode ON bulletin_paie (tenant_id, employe_id, periode_annee, periode_mois);
