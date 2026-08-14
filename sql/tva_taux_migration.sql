-- Ajoute un taux de TVA personnalisable par devis / projet (au lieu du taux
-- fixe de 20 % appliqué partout jusqu'ici) — utile par exemple pour un
-- client exonéré de TVA (organisme international, export hors UE...) ou une
-- prestation relevant d'un taux réduit (10 % / 5,5 %). Voir le sélecteur
-- "TVA" dans l'en-tête d'un devis (Devis.jsx) et dans l'onglet Infos d'un
-- projet (ProjetDetail.jsx) — ce réglage pilote le PDF du devis ET celui de
-- la facture client de ce projet.
--
-- Les commandes fournisseurs ne sont volontairement PAS concernées : leur
-- TVA dépend du fournisseur, pas du client, et reste donc fixée à 20 % (voir
-- generateCmdPDF dans ProjetDetail.jsx).
--
-- Toutes les lignes existantes basculent au défaut historique de 20 %, donc
-- ce script ne change aucun montant déjà en base — à exécuter une seule
-- fois, avant ou après déploiement du nouveau code (les deux ordres sont
-- sans risque : le code lit `projet.taux_tva ?? 20` / `devis.taux_tva ?? 20`
-- et retombe sur 20 % tant que la colonne n'existe pas encore).

alter table devis add column if not exists taux_tva numeric not null default 20;
alter table projets add column if not exists taux_tva numeric not null default 20;

-- Vérification : doit renvoyer 20 pour toutes les lignes existantes.
select id, titre, taux_tva from devis;
select id, nom, taux_tva from projets;
