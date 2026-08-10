-- 06_corbeille_soft_delete.sql
-- Corbeille : les suppressions ne détruisent plus les données
-- immédiatement, elles les marquent "supprimées" (colonne deleted_at).
-- L'app filtre déjà partout les lignes non supprimées, et une page
-- Corbeille permet de restaurer un projet/client/fournisseur supprimé par
-- erreur, ou de le supprimer définitivement.

alter table public.projets        add column if not exists deleted_at timestamptz;
alter table public.clients        add column if not exists deleted_at timestamptz;
alter table public.fournisseurs   add column if not exists deleted_at timestamptz;
alter table public.projet_lignes  add column if not exists deleted_at timestamptz;
alter table public.commandes      add column if not exists deleted_at timestamptz;
alter table public.factures_frs   add column if not exists deleted_at timestamptz;
alter table public.factures_cli   add column if not exists deleted_at timestamptz;

-- Index pour que les listes ("où deleted_at est null") restent rapides
-- même quand la corbeille commence à contenir beaucoup d'éléments.
create index if not exists idx_projets_deleted_at        on public.projets (deleted_at);
create index if not exists idx_clients_deleted_at        on public.clients (deleted_at);
create index if not exists idx_fournisseurs_deleted_at   on public.fournisseurs (deleted_at);
create index if not exists idx_projet_lignes_deleted_at  on public.projet_lignes (deleted_at);
create index if not exists idx_commandes_deleted_at      on public.commandes (deleted_at);
create index if not exists idx_factures_frs_deleted_at   on public.factures_frs (deleted_at);
create index if not exists idx_factures_cli_deleted_at   on public.factures_cli (deleted_at);
