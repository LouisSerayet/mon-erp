-- roles_utilisateurs_fix_type_email.sql
-- Corrige "structure of query does not match function result type" sur
-- profils_utilisateurs_tous(), vu en Prod une fois l'ambiguïté user_id/role
-- réglée (voir roles_utilisateurs_fix_ambiguite.sql /
-- roles_utilisateurs_fix_ambiguite_2.sql) et le test "est Gérant" franchi.
--
-- Cause : auth.users.email est de type `character varying(255)`, alors
-- que `returns table (..., email text, ...)` déclare du `text` — RETURN
-- QUERY exige une correspondance exacte, pas de cast automatique comme le
-- ferait un simple SELECT INTO. Fix : caster explicitement au.email::text.

create or replace function public.profils_utilisateurs_tous()
returns table (user_id uuid, email text, nom text, telephone text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profils_utilisateurs pu
    where pu.user_id = auth.uid() and pu.role = 'Gérant'
  ) then
    raise exception 'Réservé au rôle Gérant.';
  end if;
  return query
    select au.id, au.email::text, pu.nom, pu.telephone, coalesce(pu.role, 'Collaborateur')
    from auth.users au
    left join public.profils_utilisateurs pu on pu.user_id = au.id
    order by au.email;
end;
$$;
grant execute on function public.profils_utilisateurs_tous() to authenticated;
