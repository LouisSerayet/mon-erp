-- ============================================================
-- Resynchronisation globale du CA (montant_ht) des projets.
--
-- Contexte : le calcul du prévisionnel (onglet Rentabilité) et la
-- mise à jour du CA du projet ne prenaient en compte que les lignes
-- de type "lot", en ignorant les lignes ajoutées sans lot
-- ("+ Ligne manuelle" sans lot associé, ex : projet "AUDIT CVC").
-- C'est corrigé dans le code. Ce script répare les projets déjà
-- affectés en recalculant leur montant_ht à partir de TOUTES leurs
-- lignes (lots + lignes sans lot).
--
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================


-- ── ÉTAPE 1 (lecture seule) ──────────────────────────────────
-- Liste les projets dont le montant_ht actuel ne correspond pas
-- au total réel de leurs lignes (lots + lignes sans lot).
select
  p.id            as projet_id,
  p.nom           as projet_nom,
  p.montant_ht    as montant_ht_actuel,
  sub.total       as montant_ht_recalcule
from projets p
join (
  select projet_id, sum(total_ht) as total
  from projet_lignes
  where type = 'lot' or (type = 'ligne' and lot is null)
  group by projet_id
) sub on sub.projet_id = p.id
where sub.total > 0
  and (p.montant_ht is null or p.montant_ht != sub.total);


-- ── ÉTAPE 2 (écriture) ───────────────────────────────────────
begin;

update projets p
set montant_ht = sub.total
from (
  select projet_id, sum(total_ht) as total
  from projet_lignes
  where type = 'lot' or (type = 'ligne' and lot is null)
  group by projet_id
) sub
where p.id = sub.projet_id
  and sub.total > 0
  and (p.montant_ht is null or p.montant_ht != sub.total);

-- Vérifie le résultat ci-dessous AVANT de valider.
-- Si tout est correct : exécute "commit;"
-- Si quelque chose cloche : exécute "rollback;"
commit;
-- rollback;


-- ── ÉTAPE 3 (lecture seule) ──────────────────────────────────
-- Vérification : montant_ht doit maintenant correspondre au total
-- des lignes pour chaque projet qui en a.
select
  p.id, p.nom, p.montant_ht,
  sub.total as total_lignes
from projets p
join (
  select projet_id, sum(total_ht) as total
  from projet_lignes
  where type = 'lot' or (type = 'ligne' and lot is null)
  group by projet_id
) sub on sub.projet_id = p.id
order by p.id;
