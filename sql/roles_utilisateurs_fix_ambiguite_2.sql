-- roles_utilisateurs_fix_ambiguite_2.sql
-- Suite de roles_utilisateurs_fix_ambiguite.sql : la même ambiguïté
-- "column reference user_id is ambiguous" touchait aussi le trigger
-- anti auto-promotion (profils_utilisateurs_proteger_role, déclenché à
-- CHAQUE update sur profils_utilisateurs — y compris "Enregistrer" sur
-- Mes informations) et definir_role_utilisateur (appelée en changeant le
-- rôle de quelqu'un depuis "Rôles de l'équipe"). Même fix : alias de
-- table (pu.user_id, pu.role) au lieu de user_id/role sans préfixe.
-- Ne touche pas profils_utilisateurs_tous(), déjà corrigée.

create or replace function public.profils_utilisateurs_proteger_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profils_utilisateurs pu
      where pu.user_id = auth.uid() and pu.role = 'Gérant'
    ) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.definir_role_utilisateur(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not exists (
    select 1 from public.profils_utilisateurs pu
    where pu.user_id = auth.uid() and pu.role = 'Gérant'
  ) then
    raise exception 'Réservé au rôle Gérant.';
  end if;
  if p_role not in ('Gérant', 'Associé', 'Collaborateur', 'Stagiaire') then
    raise exception 'Rôle invalide : %', p_role;
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'Utilisateur introuvable.';
  end if;
  insert into public.profils_utilisateurs (user_id, email, role)
  values (p_user_id, v_email, p_role)
  on conflict (user_id) do update set role = excluded.role;
end;
$$;
grant execute on function public.definir_role_utilisateur(uuid, text) to authenticated;
