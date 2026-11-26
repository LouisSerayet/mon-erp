-- factures_frs_a_traiter_detection_dates_migration.sql
-- Suite de sql/factures_frs_a_traiter_detection_migration.sql (numéro de
-- facture + montant HT détectés) : Louis demande que "tout soit renseigné
-- automatiquement" à la lecture du PDF — la date de facture et l'échéance
-- restaient jusqu'ici TOUJOURS vides à l'arrivée dans la Boîte de
-- réception (voir BoiteReceptionFactures.jsx), à ressaisir à chaque
-- facture alors qu'elles sont imprimées sur le document. Ajoute deux
-- colonnes de plus, repérées dans le texte extrait du PDF (voir
-- extraireDateFacture/extraireDateEcheance/extraireTauxTva dans
-- api/import-factures-frs.js).
--
-- Même principe que les deux colonnes précédentes : ce ne sont que des
-- SUGGESTIONS pré-remplies, toujours modifiables à la validation, jamais
-- utilisées telles quelles pour créer la vraie facture fournisseur. Le
-- taux de TVA est inclus ici aussi : jusqu'ici la Boîte de réception ne
-- le demandait même pas (la facture créée retombait silencieusement sur
-- l'hypothèse par défaut de l'app, 20 % — voir sql/
-- taux_tva_achats_migration.sql), alors qu'il est lui aussi imprimé sur
-- la facture.
--
-- À exécuter après sql/factures_frs_a_traiter_detection_migration.sql
-- (déjà en place).

alter table public.factures_frs_a_traiter
  add column if not exists date_facture_detectee date,   -- ex. "Date de facture : 12/01/2026" ou "Facture du 12 janvier 2026"
  add column if not exists date_echeance_detectee date,   -- ex. "Échéance : 11/02/2026" / "À régler avant le ..." — repli : calculée depuis la date de facture + les conditions de paiement du fournisseur si rien n'est trouvé sur le PDF (voir BoiteReceptionFactures.jsx)
  add column if not exists taux_tva_detecte numeric;       -- ex. "TVA 20,00 %"

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'factures_frs_a_traiter'
order by ordinal_position;
