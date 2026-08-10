-- ============================================================
-- Intégration Pennylane — ajout des colonnes de liaison.
-- Purement additif : aucune donnée existante n'est touchée.
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================

-- Adresse structurée du client, exigée par Pennylane pour créer un
-- "company_customer" (le champ "adresse" existant reste tel quel).
alter table clients add column if not exists rue text;
alter table clients add column if not exists code_postal text;
alter table clients add column if not exists ville text;
alter table clients add column if not exists pays text default 'FR';

-- Lien client ERP <-> client Pennylane (créé une fois, réutilisé ensuite)
alter table clients add column if not exists pennylane_customer_id bigint;

-- Adresse structurée du fournisseur (même besoin côté company_supplier)
alter table fournisseurs add column if not exists rue text;
alter table fournisseurs add column if not exists code_postal text;
alter table fournisseurs add column if not exists ville text;
alter table fournisseurs add column if not exists pays text default 'FR';

-- Lien fournisseur ERP <-> fournisseur Pennylane
alter table fournisseurs add column if not exists pennylane_supplier_id bigint;

-- Suivi de synchro sur les factures clients
alter table factures_cli add column if not exists pennylane_invoice_id bigint;
alter table factures_cli add column if not exists pennylane_statut text;
alter table factures_cli add column if not exists pennylane_synced_at timestamptz;

-- Suivi de synchro sur les factures fournisseurs + fichier joint
alter table factures_frs add column if not exists pennylane_invoice_id bigint;
alter table factures_frs add column if not exists pennylane_statut text;
alter table factures_frs add column if not exists pennylane_synced_at timestamptz;
alter table factures_frs add column if not exists fichier_path text;

-- Vérification
select table_name, column_name, data_type from information_schema.columns
where table_name in ('clients', 'fournisseurs', 'factures_cli', 'factures_frs')
  and (column_name like 'pennylane%' or column_name in ('rue', 'code_postal', 'ville', 'pays', 'fichier_path'))
order by table_name, column_name;
