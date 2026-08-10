-- ============================================================
-- Rattrapage : projets créés depuis un devis accepté qui n'ont
-- jamais reçu les lignes du devis (bug corrigé dans le code,
-- ce script répare les données déjà en base).
--
-- À exécuter dans Supabase → SQL Editor, étape par étape.
-- Chaque étape est indépendante : lis le résultat avant de
-- passer à la suivante.
-- ============================================================


-- ── ÉTAPE 1 (lecture seule) ──────────────────────────────────
-- Liste les projets concernés : créés depuis un devis, mais
-- dont l'onglet "Lignes" est vide.
select
  p.id           as projet_id,
  p.nom          as projet_nom,
  p.montant_ht   as projet_montant_ht,
  p.devis_id,
  d.montant_ht   as devis_montant_ht,
  (select count(*) from devis_lignes dl where dl.devis_id = p.devis_id) as nb_lignes_devis
from projets p
join devis d on d.id = p.devis_id
where p.devis_id is not null
  and not exists (select 1 from projet_lignes pl where pl.projet_id = p.id);


-- ── ÉTAPE 2 (écriture) ───────────────────────────────────────
-- Copie les lignes du devis vers le projet, pour chaque projet
-- listé à l'étape 1. Ne touche à rien d'autre.
begin;

insert into projet_lignes (
  projet_id, type, numero, categorie, descriptif, unite, qte,
  prix_unit_ht, total_ht, coeff, prix_achat_ht, total_achat, fournisseur, lot, ordre
)
select
  p.id, dl.type, dl.numero, dl.categorie, dl.descriptif, dl.unite, dl.qte,
  dl.prix_unit_ht, dl.total_ht, dl.coeff, dl.prix_achat_ht, dl.total_achat, dl.fournisseur, dl.lot, dl.ordre
from projets p
join devis_lignes dl on dl.devis_id = p.devis_id
where p.devis_id is not null
  and not exists (select 1 from projet_lignes pl where pl.projet_id = p.id);

-- Si le montant_ht du projet était resté à 0/null (CA jamais
-- recopié depuis le devis), on le recalcule à partir des lots
-- qu'on vient de restaurer.
update projets p
set montant_ht = sub.total
from (
  select projet_id, sum(total_ht) as total
  from projet_lignes
  where type = 'lot'
  group by projet_id
) sub
where p.id = sub.projet_id
  and (p.montant_ht is null or p.montant_ht = 0)
  and sub.total > 0;

-- Vérifie le résultat ci-dessous AVANT de valider.
-- Si tout est correct : exécute "commit;"
-- Si quelque chose cloche : exécute "rollback;"
commit;
-- rollback;


-- ── ÉTAPE 3 (lecture seule) ──────────────────────────────────
-- Vérification finale : ces projets doivent maintenant avoir
-- des lignes et un montant_ht cohérent.
select
  p.id, p.nom, p.montant_ht,
  count(pl.id) filter (where pl.type = 'lot') as nb_lots,
  sum(pl.total_achat) filter (where pl.type = 'lot') as achat_prevu_total
from projets p
join projet_lignes pl on pl.projet_id = p.id
where p.devis_id is not null
group by p.id, p.nom, p.montant_ht
order by p.id;
