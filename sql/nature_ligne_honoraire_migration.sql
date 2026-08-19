-- Ajoute "honoraire" comme nouvelle valeur possible de categorie_ligne
-- (projet_lignes), en plus de negoce / option / variante / texte — voir
-- categorie_ligne_migration.sql pour la mise en place initiale, et
-- NATURE_LIGNE_OPTIONS dans src/lib/calculs.js pour la liste complète.
--
-- Une ligne "Honoraire" est une ligne de vente pure (honoraires, frais de
-- gestion...) : elle compte normalement dans le total du devis, comme une
-- ligne négoce, mais n'a pas d'achat associé — prix_achat_ht et coeff
-- restent à 0/vide pour ce type de ligne (voir calculerLigne, mode
-- 'honoraire', dans lib/calculs.js). Le sélecteur "Nature" de l'onglet
-- Lignes d'un projet propose ce nouveau choix.
--
-- Cette migration ne touche aucune ligne existante : elle élargit juste la
-- contrainte CHECK pour autoriser la nouvelle valeur.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'projet_lignes_categorie_ligne_check'
  ) then
    alter table projet_lignes drop constraint projet_lignes_categorie_ligne_check;
  end if;
  alter table projet_lignes
    add constraint projet_lignes_categorie_ligne_check
    check (categorie_ligne in ('negoce', 'honoraire', 'option', 'variante', 'texte'));
end $$;

-- Vérification : ne doit renvoyer aucune ligne (toute valeur en base est déjà couverte par la contrainte élargie).
select id, descriptif, categorie_ligne from projet_lignes
where categorie_ligne not in ('negoce', 'honoraire', 'option', 'variante', 'texte');
