-- client_contacts_migration.sql
-- Permet d'associer plusieurs contacts à un même client (ex: un contact
-- Facturation, un contact Livraison, un contact Personnel...), en plus des
-- champs contact/email/telephone existants sur la table clients qui restent
-- inchangés (utilisés tels quels par les PDF devis/factures, Pennylane,
-- etc. — voir src/lib/pdfCgv.js, src/lib/pdfStyle.js, src/lib/usePennylane.js).
--
-- Réutilise les mêmes conventions que le reste de l'app : suppression douce
-- (deleted_at, cf. 06_corbeille_soft_delete.sql — un contact supprimé est
-- récupérable 30 jours depuis la Corbeille), historique des modifications
-- (cf. 07_historique_modifications.sql).
--
-- Le "type" de contact (Facturation, Livraison, Général...) est un simple
-- champ texte libre côté base : l'UI (Clients.jsx) propose des suggestions
-- courantes via une <datalist> mais n'importe quelle valeur est acceptée.

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null default 'Général',
  nom text,
  email text,
  telephone text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_client_contacts_client_id on public.client_contacts (client_id);
create index if not exists idx_client_contacts_deleted_at on public.client_contacts (deleted_at);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.client_contacts enable row level security;
drop policy if exists "authenticated_full_access" on public.client_contacts;
create policy "authenticated_full_access" on public.client_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Historique des modifications ────────────────────────────────────
-- Nécessite que 07_historique_modifications.sql ait déjà été exécuté
-- (la fonction public.audit_trigger_fn doit exister) — c'est déjà le cas
-- puisque la page "Historique" fonctionne déjà dans l'app.
drop trigger if exists audit_trg on public.client_contacts;
create trigger audit_trg after insert or update or delete on public.client_contacts
  for each row execute function public.audit_trigger_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'client_contacts'
order by ordinal_position;
