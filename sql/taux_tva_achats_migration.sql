-- taux_tva_achats_migration.sql
-- Jusqu'ici, côté achats (commandes, factures fournisseurs, dépenses
-- générales), le Compte de résultat et le mémo TVA de l'onglet Trésorerie
-- supposaient un taux fixe de 20 % pour tout le monde (0 % uniquement en
-- autoliquidation, ou par catégorie "devinée" pour les dépenses générales
-- — voir tauxTvaDepense dans lib/tva.js) : aucun champ ne permettait de
-- dire "cette facture-là, c'est 5,5 %" ou "il n'y a pas de TVA du tout
-- dessus, et ce n'est pas de l'autoliquidation". Ce qui est faux dès
-- qu'un achat (carte bancaire notamment) a un taux différent ou pas de
-- TVA du tout.
--
-- Chaque table où un prix est saisi côté achats reçoit donc son propre
-- taux_tva, éditable ligne par ligne, indépendant de la case
-- "Autoliquidation" existante (commandes.regime_tva / fournisseurs.
-- autoliquidation) qui reste un cas à part (TVA déclarée ET déduite en
-- même temps, effet net nul) — voir lib/tva.js (calculerTva) pour le
-- calcul exact.
--
-- NULL = pas encore renseigné (lignes créées avant ce correctif) :
-- l'app retombe alors sur l'ancienne hypothèse (20 %, ou la catégorie
-- devinée pour une dépense générale) plutôt que de casser l'historique —
-- voir lib/tva.js.

alter table public.commandes add column if not exists taux_tva numeric;
alter table public.factures_frs add column if not exists taux_tva numeric;
alter table public.depenses_generales add column if not exists taux_tva numeric;

comment on column public.commandes.taux_tva is
  'Taux de TVA (en %, ex: 20, 10, 5.5, 0) de cette commande. NULL = non renseigné, l''app suppose 20% par défaut. Indépendant de regime_tva (autoliquidation) — voir lib/tva.js.';
comment on column public.factures_frs.taux_tva is
  'Taux de TVA (en %, ex: 20, 10, 5.5, 0) réellement appliqué sur cette facture fournisseur, saisi manuellement (le fournisseur ne transmet pas toujours cette info structurée, notamment les achats carte bancaire). NULL = non renseigné, l''app suppose 20% sauf autoliquidation. Voir lib/tva.js.';
comment on column public.depenses_generales.taux_tva is
  'Taux de TVA (en %) réel de cette dépense générale. NULL = non renseigné, l''app retombe sur le taux "deviné" par catégorie (tauxTvaDepense dans lib/tva.js, ex: 0% pour Assurance).';

-- ── Vérification ─────────────────────────────────────────────────────
select id, numero, montant_ht, taux_tva from public.commandes order by created_at desc limit 10;
select id, numero, montant_ht, taux_tva from public.factures_frs order by created_at desc limit 10;
select id, libelle, montant_ht, taux_tva from public.depenses_generales order by created_at desc limit 10;
