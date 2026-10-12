-- ============================================================
-- Boîte de réception factures — possibilité de valider un email reçu
-- comme une DÉPENSE GÉNÉRALE plutôt qu'une facture fournisseur liée à
-- un projet (voir BoiteReceptionFactures.jsx).
--
-- Jusqu'ici, un email arrivant dans la boîte de réception ne pouvait
-- être validé que comme factures_frs (projet_id obligatoire). Beaucoup
-- de factures reçues ne concernent pourtant aucun projet client (ex. la
-- note d'honoraires du comptable, un abonnement logiciel...) — Louis
-- devait jusqu'ici rejeter l'email puis recréer la dépense à la main
-- dans la page "Dépenses", en re-téléchargeant/re-uploadant le PDF.
--
-- Cette colonne permet de tracer le lien quand l'email est validé comme
-- dépense générale à la place, sur le même principe que facture_frs_id
-- déjà présent (une seule des deux colonnes est renseignée selon le
-- choix fait à la validation).
--
-- À exécuter après depenses_generales_migration.sql (table
-- depenses_generales déjà en place puisque la page "Dépenses"
-- fonctionne déjà en production).

alter table public.factures_frs_a_traiter
  add column if not exists depense_generale_id uuid references public.depenses_generales(id);

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'factures_frs_a_traiter'
order by ordinal_position;
