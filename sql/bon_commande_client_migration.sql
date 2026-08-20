-- bon_commande_client_migration.sql
-- Certains clients (marchés publics, grands comptes...) envoient un bon de
-- commande avec un numéro de référence qui doit apparaître sur les factures
-- émises pour ce projet. Un seul numéro par projet (pas par facture) : voir
-- ProjetDetail.jsx (onglet Infos, champ "N° bon de commande client") et
-- generateFactureCliPDF, qui l'imprime automatiquement sur chaque facture
-- client générée pour ce projet quand il est renseigné.
--
-- Ne remplace pas la fonctionnalité "Commandes" existante (commandes
-- passées par Partenaires Particuliers auprès de SES fournisseurs, table
-- `commandes`) : il s'agit ici de la référence donnée par le CLIENT en sens
-- inverse.

alter table public.projets add column if not exists numero_bon_commande_client text;

-- ── Vérification : ne doit renvoyer aucune ligne (colonne bien ajoutée) ──
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'projets' and column_name = 'numero_bon_commande_client';
