/**
 * Seed : référentiel global des permissions + rôles système.
 * Usage : npx ts-node prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client';

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
}

main().finally(() => prisma.$disconnect());
