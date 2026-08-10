-- 07_historique_modifications.sql
-- Historique des modifications : qui a changé quoi et quand, sur les
-- tables sensibles (projets, lignes, commandes, factures, clients,
-- fournisseurs). Implémenté via un trigger Postgres générique — il
-- capture TOUTES les écritures, y compris celles faites directement dans
-- l'éditeur SQL de Supabase, pas seulement celles passées par l'app.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null,          -- CREATION / MODIFICATION / SUPPRESSION / RESTAURATION / SUPPRESSION_DEFINITIVE
  changed_by text,
  changed_at timestamptz not null default now(),
  diff jsonb
);

create index if not exists idx_audit_log_changed_at on public.audit_log (changed_at desc);
create index if not exists idx_audit_log_record on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_read_authenticated" on public.audit_log;
create policy "audit_log_read_authenticated" on public.audit_log
  for select to authenticated using (true);
-- Pas de policy insert/update/delete pour "authenticated" : seul le
-- trigger (security definer) écrit dans cette table, jamais l'app
-- directement — l'historique ne doit pas pouvoir être modifié à la main.

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := coalesce(auth.jwt() ->> 'email', 'système');
  v_action text;
begin
  if (tg_op = 'DELETE') then
    insert into public.audit_log (table_name, record_id, action, changed_by, diff)
    values (tg_table_name, old.id::text, 'SUPPRESSION_DEFINITIVE', v_user, to_jsonb(old));
    return old;

  elsif (tg_op = 'UPDATE') then
    -- Une suppression/restauration "douce" passe par une simple UPDATE de
    -- deleted_at (voir 06_corbeille_soft_delete.sql) — on l'identifie ici
    -- pour que l'historique affiche "Suppression"/"Restauration" plutôt
    -- qu'une modification générique.
    if (to_jsonb(old) ? 'deleted_at') and old.deleted_at is null and new.deleted_at is not null then
      v_action := 'SUPPRESSION';
    elsif (to_jsonb(old) ? 'deleted_at') and old.deleted_at is not null and new.deleted_at is null then
      v_action := 'RESTAURATION';
    else
      v_action := 'MODIFICATION';
    end if;

    insert into public.audit_log (table_name, record_id, action, changed_by, diff)
    values (tg_table_name, new.id::text, v_action, v_user, jsonb_build_object('avant', to_jsonb(old), 'apres', to_jsonb(new)));
    return new;

  elsif (tg_op = 'INSERT') then
    insert into public.audit_log (table_name, record_id, action, changed_by, diff)
    values (tg_table_name, new.id::text, 'CREATION', v_user, to_jsonb(new));
    return new;
  end if;

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['projets', 'projet_lignes', 'commandes', 'factures_frs', 'factures_cli', 'clients', 'fournisseurs']
  loop
    execute format('drop trigger if exists audit_trg on public.%I', t);
    execute format('create trigger audit_trg after insert or update or delete on public.%I for each row execute function public.audit_trigger_fn()', t);
  end loop;
end $$;
