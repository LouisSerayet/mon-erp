// Catégories des "écritures diverses" — mouvements de trésorerie Qonto qui
// ne sont ni une facture client, ni une facture fournisseur, ni une
// dépense générale (ex. un apport en capital, un emprunt bancaire...), et
// qu'on ne veut donc pas faire remonter dans le Chiffre d'affaires ou les
// dépenses du Compte de résultat. Voir sql/ecritures_diverses_migration.sql
// et Rapprochement.jsx (bouton "+ Décrire ce mouvement" sur une
// transaction non rapprochée).
export const CATEGORIES_ECRITURES = ['Apport en capital', 'Emprunt bancaire', 'Remboursement', 'Subvention', 'Autre']
