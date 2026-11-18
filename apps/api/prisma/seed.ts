/**
 * Seed : référentiel global des permissions + tenant de démonstration.
 * Usage : npx ts-node prisma/seed.ts
 *
 * Comptes démo (slug 'demo', mot de passe = mot de passe du compte) :
 *   demo@tablya.dev    / Demo2024!   — Gérant (toutes permissions)
 *   admin@tablya.dev   / Admin2024!  — Super-admin plateforme (/admin/*)
 *   caisse@tablya.dev  / Caisse2024! — Caissier (encaissement + clôture)
 *   serveur@tablya.dev / Serveur2024!— Serveur (commandes + réservations)
 *   cuisine@tablya.dev / Cuisine2024!— Cuisinier (KDS)
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomUUID, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const PERMISSIONS: { code: string; module: string; description: string }[] = [
  // Établissement / catalogue
  { code: 'etablissement.modifier', module: 'etablissement', description: 'Modifier la fiche établissement' },
  { code: 'catalogue.gerer', module: 'catalogue', description: 'Gérer catégories, produits, prix' },
  { code: 'salle.gerer', module: 'salle', description: 'Gérer zones, places, plan de salle' },
  { code: 'reservation.gerer', module: 'reservation', description: 'Gérer réservations et liste d\'attente' },
  // Commandes / POS
  { code: 'commande.creer', module: 'commande', description: 'Créer une commande' },
  { code: 'commande.modifier', module: 'commande', description: 'Modifier une commande' },
  { code: 'commande.annuler', module: 'commande', description: 'Annuler une commande' },
  { code: 'caisse.encaisser', module: 'caisse', description: 'Encaisser' },
  { code: 'caisse.cloturer', module: 'caisse', description: 'Clôturer la caisse' },
  { code: 'remise.appliquer', module: 'caisse', description: 'Appliquer une remise' },
  // Paiements
  { code: 'paiement.initier', module: 'paiement', description: 'Initier un paiement' },
  { code: 'paiement.rembourser', module: 'paiement', description: 'Rembourser une transaction' },
  { code: 'portefeuille.retirer', module: 'paiement', description: 'Retirer du portefeuille' },
  { code: 'commission.modifier', module: 'paiement', description: 'Modifier les commissions' },
  // Équipe / RH
  { code: 'employe.gerer', module: 'employe', description: 'Gérer les fiches employés' },
  { code: 'role.gerer', module: 'employe', description: 'Créer/modifier les rôles' },
  { code: 'planning.gerer', module: 'employe', description: 'Gérer les plannings' },
  { code: 'pointage.effectuer', module: 'employe', description: 'Pointer' },
  { code: 'paie.preparer', module: 'paie', description: 'Préparer la paie' },
  { code: 'paie.approuver', module: 'paie', description: 'Approuver la paie (2e niveau)' },
  // Pilotage
  { code: 'rapport.exporter', module: 'pilotage', description: 'Exporter les rapports' },
  { code: 'marketing.gerer', module: 'pilotage', description: 'Gérer promotions et campagnes' },
  { code: 'avis.repondre', module: 'pilotage', description: 'Répondre aux avis' },
  { code: 'audit.lire', module: 'pilotage', description: 'Consulter le journal d\'audit' },
  // Super-admin plateforme
  { code: 'admin.etablissement.valider', module: 'admin', description: 'Valider les établissements' },
  { code: 'admin.etablissement.suspendre', module: 'admin', description: 'Suspendre un établissement' },
  { code: 'admin.transaction.superviser', module: 'admin', description: 'Superviser les transactions' },
  { code: 'admin.abonnement.gerer', module: 'admin', description: 'Gérer abonnements et commissions' },
];

/** Rôles démo et leurs permissions (codes). 'toutes' = tout le référentiel. */
const ROLES_DEMO: { code: string; nom: string; systeme?: boolean; permissions: string[] | 'toutes' }[] = [
  { code: 'gerant', nom: 'Gérant principal', systeme: true, permissions: 'toutes' },
  { code: 'super_admin', nom: 'Super-admin plateforme', systeme: true, permissions: 'toutes' },
  {
    code: 'caissier', nom: 'Caissier', permissions: [
      'commande.creer', 'commande.modifier', 'caisse.encaisser', 'caisse.cloturer',
      'paiement.initier', 'remise.appliquer',
    ],
  },
  {
    code: 'serveur', nom: 'Serveur', permissions: [
      'commande.creer', 'commande.modifier', 'reservation.gerer', 'avis.repondre',
    ],
  },
  {
    code: 'cuisinier', nom: 'Cuisinier', permissions: [
      'commande.creer', 'commande.modifier', // /kds exige commande.creer
    ],
  },
];

/** Comptes démo associés aux rôles (mot de passe propre à chaque compte). */
const COMPTES_DEMO: { email: string; motDePasse: string; roleCode: string }[] = [
  { email: 'demo@tablya.dev', motDePasse: 'Demo2024!', roleCode: 'gerant' },
  { email: 'admin@tablya.dev', motDePasse: 'Admin2024!', roleCode: 'super_admin' },
  { email: 'caisse@tablya.dev', motDePasse: 'Caisse2024!', roleCode: 'caissier' },
  { email: 'serveur@tablya.dev', motDePasse: 'Serveur2024!', roleCode: 'serveur' },
  { email: 'cuisine@tablya.dev', motDePasse: 'Cuisine2024!', roleCode: 'cuisinier' },
];

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  console.log(`${PERMISSIONS.length} permissions OK`);
  await seedDemo();
}

/**
 * Tenant de démonstration (slug 'demo') : idempotent.
 * Crée l'établissement, l'abonnement, le portefeuille, le plan de salle et
 * le catalogue si absents ; garantit ensuite les rôles et comptes démo.
 */
async function seedDemo() {
  let etablissement = await prisma.etablissement.findUnique({ where: { slug: 'demo' } });
  const tenantId = etablissement?.tenantId ?? randomUUID();
  const qrToken = () => randomBytes(24).toString('base64url');

  if (!etablissement) {
    await prisma.$transaction(async (tx) => {
      etablissement = await tx.etablissement.create({
        data: {
          tenantId,
          raisonSociale: 'Demo Restaurant',
          slug: 'demo',
          statut: 'actif',
          devise: 'XOF',
          langues: ['fr'],
        },
      });

      await tx.abonnement.create({
        data: {
          tenantId,
          etablissementId: etablissement!.id,
          plan: 'pro',
          statut: 'actif',
          montantCentimes: 1500000n,
          periode: 'mensuel',
        },
      });
      await tx.portefeuille.create({
        data: { tenantId, etablissementId: etablissement!.id },
      });

      const zone = await tx.zone.create({
        data: { tenantId, etablissementId: etablissement!.id, nom: 'Salle principale' },
      });
      await tx.place.createMany({
        data: [1, 2, 3, 4].map((n) => ({
          tenantId,
          etablissementId: etablissement!.id,
          zoneId: zone.id,
          numero: `T-${n}`,
          capacite: 4,
          qrToken: qrToken(),
        })),
      });

      const plats = await tx.categorie.create({
        data: { tenantId, etablissementId: etablissement!.id, nom: 'Plats', ordre: 1 },
      });
      const boissons = await tx.categorie.create({
        data: { tenantId, etablissementId: etablissement!.id, nom: 'Boissons', ordre: 2 },
      });

      const produits: { nom: string; categorieId: string; prix: bigint }[] = [
        { nom: 'Poulet bicyclette', categorieId: plats.id, prix: 250000n },
        { nom: 'Poisson braisé', categorieId: plats.id, prix: 300000n },
        { nom: 'Attiéké poisson', categorieId: plats.id, prix: 150000n },
        { nom: 'Jus de gingembre', categorieId: boissons.id, prix: 50000n },
        { nom: 'Bière locale', categorieId: boissons.id, prix: 100000n },
        { nom: 'Eau 1,5 L', categorieId: boissons.id, prix: 25000n },
      ];
      for (const p of produits) {
        const produit = await tx.produit.create({
          data: {
            tenantId,
            etablissementId: etablissement!.id,
            categorieId: p.categorieId,
            nom: p.nom,
            description: `Produit démo — ${p.nom}`,
          },
        });
        await tx.variante.create({
          data: {
            tenantId,
            produitId: produit.id,
            nom: 'Standard',
            prixCentimes: p.prix,
          },
        });
      }
    });
    console.log('Tenant démo créé : slug=demo');
  } else {
    console.log('Tenant démo déjà présent — comptes/rôles vérifiés');
  }

  await seedComptesDemo(tenantId, etablissement!.id);
}

/** Rôles démo + comptes utilisateurs (upsert idempotent). */
async function seedComptesDemo(tenantId: string, etablissementId: string) {
  const toutes = await prisma.permission.findMany();
  const parCode = new Map(toutes.map((p) => [p.code, p.id]));

  const roles: Record<string, string> = {};
  for (const r of ROLES_DEMO) {
    const permissionIds = r.permissions === 'toutes'
      ? toutes.map((p) => p.id)
      : r.permissions.map((c) => parCode.get(c)).filter((x): x is string => !!x);

    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code: r.code } },
      update: { nom: r.nom, systeme: r.systeme ?? false },
      create: {
        tenantId,
        etablissementId,
        code: r.code,
        nom: r.nom,
        systeme: r.systeme ?? false,
      },
    });
    roles[r.code] = role.id;

    // Remplace les permissions du rôle par le jeu démo (idempotent).
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId, tenantId })),
      });
    }
  }

  for (const c of COMPTES_DEMO) {
    const roleId = roles[c.roleCode];
    const existant = await prisma.utilisateur.findUnique({
      where: { tenantId_email: { tenantId, email: c.email } },
    });
    const motDePasseHash = await hash(c.motDePasse);
    if (existant) {
      // Mot de passe resynchronisé à chaque seed pour la démo.
      await prisma.utilisateur.update({
        where: { id: existant.id },
        data: { motDePasseHash, roleId, emailVerifie: true },
      });
    } else {
      await prisma.utilisateur.create({
        data: {
          tenantId,
          etablissementId,
          roleId,
          email: c.email,
          motDePasseHash,
          emailVerifie: true,
        },
      });
    }
  }

  console.log('Comptes démo :');
  for (const c of COMPTES_DEMO) {
    console.log(`  ${c.email} / ${c.motDePasse}  (${c.roleCode})`);
  }
}

main().finally(() => prisma.$disconnect());
