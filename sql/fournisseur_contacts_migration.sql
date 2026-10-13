-- fournisseur_contacts_migration.sql
-- Permet d'associer plusieurs contacts à un même fournisseur (ex: un contact
-- Facturation, un contact Commercial, un contact Livraison...), en plus des
-- champs contact/email/telephone existants sur la table fournisseurs qui
-- restent inchangés (utilisés tels quels par les PDF commandes, Pennylane,
-- etc. — voir src/lib/pdfCgv.js, src/lib/pdfStyle.js, src/lib/usePennylane.js).
--
-- Même besoin, même schéma que client_contacts_migration.sql (déjà exécuté
-- pour les clients) : suppression douce (deleted_at, cf.
-- 06_corbeille_soft_delete.sql — un contact supprimé est récupérable 30
-- jours depuis la Corbeille), historique des modifications (cf.
-- 07_historique_modifications.sql).
--
-- Le "type" de contact (Facturation, Commercial, Livraison, Général...) est
-- un simple champ texte libre côté base : l'UI (Fournisseurs.jsx) propose
-- des suggestions courantes via une <datalist> mais n'importe quelle valeur
-- est acceptée. Les deux pages (Clients.jsx et Fournisseurs.jsx) partagent
-- le même composant d'affichage/édition, src/components/ContactsMultiples.jsx.

create table if not exists public.fournisseur_contacts (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.fournisseurs(id) on delete cascade,
  type text not null default 'Général',
  nom text,
  email text,
  telephone text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_fournisseur_contacts_fournisseur_id on public.fournisseur_contacts (fournisseur_id);
create index if not exists idx_fournisseur_contacts_deleted_at on public.fournisseur_contacts (deleted_at);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.fournisseur_contacts enable row level security;
drop policy if exists "authenticated_full_access" on public.fournisseur_contacts;
create policy "authenticated_full_access" on public.fournisseur_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Historique des modifications ────────────────────────────────────
-- Nécessite que 07_historique_modifications.sql ait déjà été exécuté
-- (la fonction public.audit_trigger_fn doit exister) — c'est déjà le cas
-- puisque la page "Historique" fonctionne déjà dans l'app.
drop trigger if exists audit_trg on public.fournisseur_contacts;
create trigger audit_trg after insert or update or delete on public.fournisseur_contacts
  for each row execute function public.audit_trigger_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'fournisseur_contacts'
order by ordinal_position;
