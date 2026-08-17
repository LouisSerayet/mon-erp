-- Ajoute la "nature" d'une ligne de devis/projet, pour distinguer une ligne
-- classique (négoce) d'une Option (proposition facultative, hors total
-- principal du devis) ou d'une Variante (2 façons alternatives de faire la
-- même chose, une seule des deux comptant dans le total à la fois). Voir le
-- sélecteur "Nature" dans l'onglet Lignes d'un projet (ProjetDetail.jsx).
--
-- `categorie_ligne` : 'negoce' (défaut, ligne classique) / 'option' /
-- 'variante' / 'texte' (note sans montant, comme un titre mais au milieu
-- d'une liste de lignes).
-- `variante_active` : uniquement significatif quand categorie_ligne =
-- 'variante' — seule la variante active compte dans les totaux (l'autre
-- reste visible pour comparaison mais à 0 dans les calculs et absente du
-- PDF envoyé au client).
--
-- Toutes les lignes existantes basculent sur 'negoce' / actif, donc ce
-- script ne change aucun total déjà en base.

alter table projet_lignes add column if not exists categorie_ligne text not null default 'negoce';
alter table projet_lignes add column if not exists variante_active boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projet_lignes_categorie_ligne_check'
  ) then
    alter table projet_lignes
      add constraint projet_lignes_categorie_ligne_check
      check (categorie_ligne in ('negoce', 'option', 'variante', 'texte'));
  end if;
end $$;

-- Vérification : doit renvoyer 'negoce' / true pour toutes les lignes existantes.
select id, descriptif, categorie_ligne, variante_active from projet_lignes where type = 'ligne' limit 50;
