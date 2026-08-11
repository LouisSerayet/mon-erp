-- depenses_generales_migration.sql
-- Nouvelle table pour les dépenses générales de la société (loyer,
-- comptabilité, assurance, abonnements...) qui ne sont pas liées à un
-- projet client — jusqu'ici il fallait créer un faux "projet" (ex.
-- "Frais généraux") pour pouvoir les suivre.
--
-- Réutilise les mêmes conventions que factures_frs pour rester cohérent
-- avec le reste de l'app : suppression douce (deleted_at, cf.
-- 06_corbeille_soft_delete.sql), rapprochement bancaire Qonto (cf.
-- qonto_migration.sql / src/lib/rapprochement.js), historique des
-- modifications (cf. 07_historique_modifications.sql).

create table if not exists public.depenses_generales (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  categorie text not null default 'Autre',
  numero text,
  fournisseur_id uuid references public.fournisseurs(id),
  montant_ht numeric not null default 0,
  statut text not null default 'À payer', -- 'À payer' | 'Payée'
  date_facture date,
  date_echeance date,
  fichier_path text,
  qonto_transaction_id text,
  qonto_matched_at timestamptz,
  qonto_match_confiance text, -- 'exact' | 'montant'
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_depenses_generales_deleted_at on public.depenses_generales (deleted_at);
create index if not exists idx_depenses_generales_fournisseur on public.depenses_generales (fournisseur_id);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.depenses_generales enable row level security;
drop policy if exists "authenticated_full_access" on public.depenses_generales;
create policy "authenticated_full_access" on public.depenses_generales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Historique des modifications ────────────────────────────────────
-- Nécessite que 07_historique_modifications.sql ait déjà été exécuté
-- (la fonction public.audit_trigger_fn doit exister) — c'est déjà le cas
-- puisque la page "Historique" fonctionne déjà dans l'app.
drop trigger if exists audit_trg on public.depenses_generales;
create trigger audit_trg after insert or update or delete on public.depenses_generales
  for each row execute function public.audit_trigger_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'depenses_generales'
order by ordinal_position;
