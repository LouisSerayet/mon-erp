-- email_send_log_migration.sql
-- Journal des emails envoyés/mis en brouillon via api/outlook.js (boîte
-- Outlook de la société). Jusqu'ici, n'importe quelle session connectée à
-- l'ERP pouvait déclencher un envoi vers n'importe quelle adresse, sans
-- limite ni trace — acceptable tant qu'il n'y a qu'un seul utilisateur de
-- confiance, mais à encadrer avant d'ouvrir l'accès à une 2e personne (voir
-- commentaire dans api/outlook.js). Cette table sert deux choses :
--   1) une limite de débit (nombre d'envois/brouillons par utilisateur et
--      par heure), pour borner l'impact d'une session compromise ;
--   2) une trace consultable (qui a envoyé quoi, à qui, quand) en cas de
--      doute — pas encore affichée dans une page dédiée de l'ERP, mais
--      interrogeable directement dans Supabase si besoin.
-- Ne stocke ni le corps du message ni les pièces jointes : uniquement les
-- métadonnées nécessaires à ces deux usages.

create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  destinataire text,
  sujet text,
  brouillon boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_send_log_user_created on public.email_send_log (user_id, created_at);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.email_send_log enable row level security;
drop policy if exists "authenticated_full_access" on public.email_send_log;
create policy "authenticated_full_access" on public.email_send_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'email_send_log'
order by ordinal_position;
