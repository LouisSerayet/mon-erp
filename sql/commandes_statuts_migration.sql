-- Simplifie les statuts des commandes fournisseurs : "En attente" / "Envoyée"
-- / "Reçue" deviennent "Brouillon" / "Validée" ("Annulée" reste inchangée).
-- Une commande Validée est désormais figée : la modifier redemande une
-- confirmation dans l'app (voir ProjetDetail.jsx). Ce script ne fait que
-- remettre les commandes déjà existantes dans le nouveau schéma à 2-3
-- statuts — à exécuter une seule fois, après déploiement du nouveau code.
--
-- Mapping choisi :
--   "En attente"          -> "Brouillon" (pas encore envoyée au fournisseur)
--   "Envoyée" / "Reçue"   -> "Validée"   (déjà engagée auprès du fournisseur)
--   "Annulée"             -> inchangée

update commandes set statut = 'Brouillon' where statut = 'En attente';
update commandes set statut = 'Validée' where statut in ('Envoyée', 'Reçue');

-- Vérification : doit renvoyer 0 ligne après exécution.
select id, numero, statut from commandes where statut not in ('Brouillon', 'Validée', 'Annulée');
