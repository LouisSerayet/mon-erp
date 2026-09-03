-- ============================================================
-- Intégration Pennylane — extension aux dépenses générales.
-- Les dépenses générales (loyer, abonnements, assurance...) sont des
-- achats comme les factures fournisseurs : l'export groupé de la page
-- Exports les envoie maintenant aussi par email à Pennylane (adresse
-- "achats"), avec le même suivi pennylane_statut/pennylane_synced_at
-- que factures_cli/factures_frs (voir sql/pennylane_migration.sql).
-- Purement additif : aucune donnée existante n'est touchée.
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================

alter table depenses_generales add column if not exists pennylane_statut text;
alter table depenses_generales add column if not exists pennylane_synced_at timestamptz;

-- Vérification
select table_name, column_name, data_type from information_schema.columns
where table_name = 'depenses_generales'
  and column_name like 'pennylane%'
order by column_name;
