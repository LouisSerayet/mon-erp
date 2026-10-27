// Rôles utilisateurs — voir sql/roles_utilisateurs_migration.sql.
// Pour l'instant ces rôles ne servent qu'à être attribués depuis "Mes
// informations" > "Rôles de l'équipe" (page réservée au Gérant) : aucune
// action de l'appli n'est encore restreinte par rôle.
export const ROLES = ['Gérant', 'Associé', 'Collaborateur', 'Stagiaire']
