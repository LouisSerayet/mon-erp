-- ============================================================
-- Autoliquidation de TVA par défaut, par fournisseur.
-- Beaucoup de sous-traitants BTP facturent systématiquement en
-- autoliquidation (article 283 du CGI) : plutôt que de choisir le régime de
-- TVA à chaque commande, on le règle une fois sur la fiche fournisseur et
-- il se pré-sélectionne automatiquement à la création d'une commande pour
-- ce fournisseur (voir ProjetDetail.jsx, formCmd.regime_tva).
-- Purement additif : aucune donnée existante n'est touchée (les commandes
-- déjà créées gardent leur regime_tva actuel).
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================

alter table fournisseurs add column if not exists autoliquidation boolean not null default false;

-- Vérification
select id, nom, autoliquidation from fournisseurs order by nom;
