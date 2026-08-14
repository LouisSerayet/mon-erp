-- Ajoute le régime de TVA d'une commande fournisseur : "normale" (20 %,
-- comportement historique) ou "autoliquidation" (0 % facturé par le
-- fournisseur, TVA due et déclarée par Partenaires Particuliers — mécanisme
-- courant en sous-traitance BTP, article 283 du CGI).
--
-- Contrairement au taux de TVA du devis/projet (voir
-- tva_taux_migration.sql, côté vente), ce réglage est PAR COMMANDE : un
-- même projet peut avoir certaines commandes en TVA normale (fournitures,
-- matériel...) et d'autres en autoliquidation (sous-traitants BTP).
--
-- Toutes les commandes existantes basculent au comportement historique
-- ("normale" = 20 %), donc ce script ne change aucun montant déjà en base.

alter table commandes add column if not exists regime_tva text not null default 'normale';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'commandes_regime_tva_check') then
    alter table commandes add constraint commandes_regime_tva_check check (regime_tva in ('normale', 'autoliquidation'));
  end if;
end $$;

-- Vérification : doit renvoyer 'normale' pour toutes les commandes existantes.
select id, numero, regime_tva from commandes;
