-- ============================================================
-- Fusion des onglets "Devis" et "Projets" en un seul onglet
-- "Projets" : un projet démarre directement en devis (statut
-- "Brouillon"), ce qui donne accès à toutes ses infos (dont la
-- Rentabilité) avant même sa signature. Ce script migre les
-- devis existants (table `devis` / `devis_lignes`) vers cette
-- nouvelle table unique (`projets` / `projet_lignes`).
--
-- PRÉREQUIS : exécuter `tva_taux_migration.sql` AVANT ce script
-- (il ajoute la colonne `projets.taux_tva`, lue ici).
--
-- Les devis qui avaient déjà été transformés en projet via
-- l'ancien bouton "Créer le projet" (projets.devis_id renseigné)
-- ne sont PAS re-migrés : ce projet existe déjà et reflète un
-- état plus avancé (En cours, etc.) que le devis d'origine, on
-- n'y touche pas.
--
-- À exécuter dans Supabase → SQL Editor, étape par étape. Chaque
-- étape est indépendante : lis le résultat avant de passer à la
-- suivante. Exécute ce script APRÈS avoir déployé le nouveau code
-- (onglet "Devis" supprimé) pour être sûr qu'aucun nouveau devis
-- n'est créé pendant la migration.
-- ============================================================


-- ── ÉTAPE 1 (lecture seule) ──────────────────────────────────
-- Liste les devis qui n'ont encore aucun projet correspondant :
-- ce sont ceux que ce script va migrer. Vérifie que le compte et
-- les titres correspondent à ce que tu attends avant de continuer.
select
  d.id, d.titre, d.statut as statut_devis,
  case d.statut
    when 'Brouillon' then 'Brouillon'
    when 'Envoyé'    then 'Devis envoyé'
    when 'Accepté'   then 'Devis signé'
    when 'Refusé'    then 'Perdu'
    else 'Brouillon'
  end as futur_statut_projet,
  d.client_id, d.montant_ht, d.taux_tva,
  (select count(*) from devis_lignes dl where dl.devis_id = d.id) as nb_lignes
from devis d
where not exists (select 1 from projets p where p.devis_id = d.id)
order by d.created_at;


-- ── ÉTAPE 2 (écriture) ───────────────────────────────────────
begin;

-- Crée un projet pour chaque devis pas encore converti, avec le
-- statut correspondant à son statut de devis (voir mapping
-- ci-dessus — validé avec l'utilisateur : Brouillon→Brouillon,
-- Envoyé→"Devis envoyé", Accepté→"Devis signé", Refusé→"Perdu").
insert into projets (nom, client_id, statut, taux_tva, notes, montant_ht, devis_id)
select
  d.titre,
  d.client_id,
  case d.statut
    when 'Brouillon' then 'Brouillon'
    when 'Envoyé'    then 'Devis envoyé'
    when 'Accepté'   then 'Devis signé'
    when 'Refusé'    then 'Perdu'
    else 'Brouillon'
  end,
  coalesce(d.taux_tva, 20),
  d.notes,
  coalesce(d.montant_ht, 0),
  d.id
from devis d
where not exists (select 1 from projets p where p.devis_id = d.id);

-- Copie les lignes de chaque devis migré vers son nouveau projet.
-- Idempotent : ne copie que pour les projets qui n'ont pas encore
-- de lignes, donc rejouable sans risque de doublon si l'étape 2
-- est relancée après un rollback.
insert into projet_lignes (
  projet_id, type, numero, categorie, descriptif, unite, qte,
  prix_unit_ht, total_ht, coeff, prix_achat_ht, total_achat, fournisseur, lot, ordre
)
select
  p.id, dl.type, dl.numero, dl.categorie, dl.descriptif, dl.unite, dl.qte,
  dl.prix_unit_ht, dl.total_ht, dl.coeff, dl.prix_achat_ht, dl.total_achat, dl.fournisseur, dl.lot, dl.ordre
from devis_lignes dl
join projets p on p.devis_id = dl.devis_id
where not exists (select 1 from projet_lignes pl2 where pl2.projet_id = p.id);

-- Vérifie le résultat ci-dessous (étape 3) AVANT de valider.
-- Si tout est correct : exécute "commit;"
-- Si quelque chose cloche : exécute "rollback;"
commit;
-- rollback;


-- ── ÉTAPE 3 (lecture seule) ──────────────────────────────────
-- Vérification : chaque devis migré doit avoir un projet avec le
-- bon statut, le bon montant, et le même nombre de lignes.
select
  d.id as devis_id, d.titre, d.statut as statut_devis, d.montant_ht as montant_devis,
  p.id as projet_id, p.statut as statut_projet, p.montant_ht as montant_projet,
  (select count(*) from devis_lignes dl where dl.devis_id = d.id) as nb_lignes_devis,
  (select count(*) from projet_lignes pl where pl.projet_id = p.id) as nb_lignes_projet
from devis d
join projets p on p.devis_id = d.id
order by d.created_at;


-- ============================================================
-- NETTOYAGE (MANUEL, PLUS TARD) — ne pas exécuter maintenant.
--
-- À faire seulement après avoir vérifié dans l'app que TOUS les
-- projets migrés (étape 3 ci-dessus) sont corrects — lignes,
-- montants, rentabilité — et qu'un peu de recul (quelques jours
-- d'utilisation normale) confirme qu'il n'y a pas de régression.
-- Une fois ce nettoyage exécuté, les tables `devis`/`devis_lignes`
-- et la colonne `projets.devis_id` disparaissent définitivement.
-- ============================================================

-- alter table projets drop column devis_id;
-- drop table devis_lignes;
-- drop table devis;
