-- ============================================================
-- Intégration Qonto — rapprochement des paiements factures.
-- Purement additif : aucune donnée existante n'est touchée.
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================

-- Lien facture <-> transaction Qonto qui l'a soldée, pour ne jamais
-- réutiliser la même transaction sur une autre facture, et savoir quelle
-- transaction a réglé quelle facture.
alter table factures_cli add column if not exists qonto_transaction_id text;
alter table factures_cli add column if not exists qonto_matched_at timestamptz;
alter table factures_cli add column if not exists qonto_match_confiance text; -- 'exact' | 'montant'

alter table factures_frs add column if not exists qonto_transaction_id text;
alter table factures_frs add column if not exists qonto_matched_at timestamptz;
alter table factures_frs add column if not exists qonto_match_confiance text;

-- Vérification
select table_name, column_name, data_type from information_schema.columns
where table_name in ('factures_cli', 'factures_frs')
  and column_name like 'qonto%'
order by table_name, column_name;
