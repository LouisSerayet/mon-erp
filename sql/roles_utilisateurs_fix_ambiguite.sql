-- roles_utilisateurs_fix_ambiguite.sql
-- Corrige "column reference user_id is ambiguous" sur
-- profils_utilisateurs_tous(), vu en Prod sur la page "Mes informations" >
-- "Rôles de l'équipe".
--
-- Cause : `returns table (user_id uuid, email text, nom text, telephone
-- text, role text)` crée des paramètres de sortie implicites nommés
-- user_id/email/nom/telephone/role, visibles dans tout le corps de la
-- fonction. Le test `where user_id = auth.uid() and role = 'Gérant'`
-- (sans alias de table) devenait donc ambigu entre la colonne de
-- profils_utilisateurs et ce paramètre de sortie. Fix : qualifier
-- explicitement les colonnes avec un alias de table dans ce test.
--
-- Remplace entièrement roles_utilisateurs_migration.sql pour cette seule
-- fonction (le reste de cette migration — colonne role, contrainte,
-- bootstrap Gérant, trigger anti auto-promotion, definir_role_utilisateur
-- — n'est pas concerné et n'a pas besoin d'être rejoué).

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
    select au.id, au.email, pu.nom, pu.telephone, coalesce(pu.role, 'Collaborateur')
    from auth.users au
    left join public.profils_utilisateurs pu on pu.user_id = au.id
    order by au.email;
end;
$$;
grant execute on function public.profils_utilisateurs_tous() to authenticated;

-- ── Vérification ─────────────────────────────────────────────────────
select * from public.profils_utilisateurs_tous();
