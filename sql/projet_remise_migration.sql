-- Remise exceptionnelle sur le total du devis (demandé par Louis, nov.
-- 2026) : pourcentage ou montant fixe appliqué sur le total vente HT du
-- projet, pour éviter d'ajouter une ligne négative à chaque devis. Une fois
-- active, cette remise réduit le total vente "net" utilisé partout dans
-- l'ERP (PDF devis, marge/rentabilité, reste à facturer, CA des listes
-- Projets/Clients et du dashboard) — voir montantRemiseProjet/
-- totalVenteNetRemise (src/lib/calculs.js) et l'onglet Lignes de
-- ProjetDetail.jsx (bouton "Remise exceptionnelle").
alter table projets add column if not exists remise_active boolean not null default false;
alter table projets add column if not exists remise_type text not null default 'pourcentage';
alter table projets add column if not exists remise_valeur numeric not null default 0;

alter table projets drop constraint if exists projets_remise_type_check;
alter table projets add constraint projets_remise_type_check check (remise_type in ('pourcentage', 'montant'));
