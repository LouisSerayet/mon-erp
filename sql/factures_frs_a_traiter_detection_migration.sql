-- ============================================================
-- Boîte de réception factures — pré-remplissage du numéro de facture et
-- du montant HT à partir du texte extrait du PDF (voir
-- api/import-factures-frs.js, extraireNumeroFacture / extraireMontantHT).
--
-- Contrairement au numéro de commande (format imposé par Louis lui-même,
-- "PP-<PROJET>-<NNN>", donc fiable), le numéro de facture et le montant
-- HT n'ont aucun format garanti — chaque fournisseur présente sa facture
-- différemment. Ces deux colonnes ne sont donc que des SUGGESTIONS,
-- toujours modifiables à la validation (voir BoiteReceptionFactures.jsx)
-- et jamais utilisées telles quelles pour créer la vraie facture
-- fournisseur.
--
-- À exécuter après sql/factures_frs_a_traiter_migration.sql (déjà en
-- place puisque la boîte de réception fonctionne déjà en production).

alter table public.factures_frs_a_traiter
  add column if not exists numero_facture_detecte text, -- ex. "F20252026-0304", repéré près de "Facture n°" / "N° facture" dans le texte du PDF
  add column if not exists montant_ht_detecte numeric;   -- ex. 5275.00, repéré près de "Total HT" / "Montant HT" dans le texte du PDF

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'factures_frs_a_traiter'
order by ordinal_position;
