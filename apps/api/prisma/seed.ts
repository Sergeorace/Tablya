/**
 * Seed : référentiel global des permissions + rôles système.
 * Usage : npx ts-node prisma/seed.ts
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
 * Tenant de démonstration idempotent (slug 'demo') :
 * gérant demo@tablya.dev / Demo2024! — établissement actif, abonnement pro,
 * plan de salle minimal et catalogue d'exemple pour le dev et les e2e.
 */
async function seedDemo() {
  const existant = await prisma.etablissement.findUnique({ where: { slug: 'demo' } });
  if (existant) {
    console.log('Tenant démo déjà présent — ignoré');
    return;
  }

  const tenantId = randomUUID();
  const passwordHash = await hash('Demo2024!');
  const qrToken = () => randomBytes(24).toString('base64url');

  await prisma.$transaction(async (tx) => {
    const etablissement = await tx.etablissement.create({
      data: {
        tenantId,
        raisonSociale: 'Demo Restaurant',
        slug: 'demo',
        statut: 'actif',
        devise: 'XOF',
        langues: ['fr'],
      },
    });

    const permissions = await tx.permission.findMany();
    const role = await tx.role.create({
      data: {
        tenantId,
        etablissementId: etablissement.id,
        code: 'gerant',
        nom: 'Gérant principal',
      },
    });
    if (permissions.length) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
          tenantId,
        })),
      });
    }

    await tx.utilisateur.create({
      data: {
        tenantId,
        etablissementId: etablissement.id,
        roleId: role.id,
        email: 'demo@tablya.dev',
        motDePasseHash: passwordHash,
        emailVerifie: true,
      },
    });

    await tx.abonnement.create({
      data: {
        tenantId,
        etablissementId: etablissement.id,
        plan: 'pro',
        statut: 'actif',
        montantCentimes: 1500000n,
        periode: 'mensuel',
      },
    });
    await tx.portefeuille.create({
      data: { tenantId, etablissementId: etablissement.id },
    });

    const zone = await tx.zone.create({
      data: { tenantId, etablissementId: etablissement.id, nom: 'Salle principale' },
    });
    await tx.place.createMany({
      data: [1, 2, 3, 4].map((n) => ({
        tenantId,
        etablissementId: etablissement.id,
        zoneId: zone.id,
        numero: `T-${n}`,
        capacite: 4,
        qrToken: qrToken(),
      })),
    });

    const plats = await tx.categorie.create({
      data: { tenantId, etablissementId: etablissement.id, nom: 'Plats', ordre: 1 },
    });
    const boissons = await tx.categorie.create({
      data: { tenantId, etablissementId: etablissement.id, nom: 'Boissons', ordre: 2 },
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
          etablissementId: etablissement.id,
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

  console.log('Tenant démo créé : slug=demo, email=demo@tablya.dev, mot de passe=Demo2024!');
}

main().finally(() => prisma.$disconnect());
