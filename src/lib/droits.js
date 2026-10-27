// Catalogue des droits attribuables par rôle — voir
// sql/droits_roles_migration.sql et la page "Droits par rôle" sur Mes
// informations (réservée au Gérant). Ajouter une entrée ici ET une ligne
// dans la migration SQL suffit à rendre un nouveau droit disponible dans
// l'UI d'administration — il faut ensuite l'utiliser quelque part via
// useDroits().aDroit('cle') pour qu'il ait un effet réel dans l'appli.
export const DROITS = [
  { cle: 'facturation_client', label: 'Créer une facture client' },
  { cle: 'pennylane', label: 'Envoyer les factures vers Pennylane' },
  { cle: 'commande_creation', label: 'Créer une commande fournisseur' },
  { cle: 'commande_validation', label: 'Valider une commande fournisseur' },
  { cle: 'commande_modification', label: 'Modifier une commande fournisseur' },
  { cle: 'facture_frs_validation', label: 'Valider une facture fournisseur' },
  { cle: 'rapprochement_modification', label: 'Modifier le rapprochement bancaire' },
  { cle: 'financier_acces', label: "Accéder à l'onglet Financier" },
]
