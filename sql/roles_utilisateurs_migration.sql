-- roles_utilisateurs_migration.sql
-- Rôles utilisateurs (Gérant / Associé / Collaborateur / Stagiaire) —
-- première brique d'un vrai système de permissions, demandée par Louis
-- pour pouvoir ensuite restreindre certaines actions (facturation client,
-- Pennylane...) à certains rôles. Pour l'instant cette migration ne fait
-- QUE poser l'infrastructure (colonne + page pour l'attribuer) : aucune
-- action de l'appli n'est encore restreinte par rôle — à faire au fur et
-- à mesure que Louis précise les règles souhaitées pour chaque rôle.
--
-- Le rôle vit sur profils_utilisateurs (voir
-- profils_utilisateurs_migration.sql, déjà la fiche "une ligne par
-- utilisateur" de l'app) plutôt que dans une table à part : pas besoin
-- d'une seconde table pour un simple champ texte contraint, même
-- convention que les statuts partout ailleurs dans l'app (ex. STATUTS_PROJET
-- dans Projets.jsx, simple tableau JS + colonne texte, pas de table de
-- référence séparée).

alter table public.profils_utilisateurs
  add column if not exists role text not null default 'Collaborateur';

alter table public.profils_utilisateurs
  drop constraint if exists profils_utilisateurs_role_check;
alter table public.profils_utilisateurs
  add constraint profils_utilisateurs_role_check
  check (role in ('Gérant', 'Associé', 'Collaborateur', 'Stagiaire'));

-- Louis devient "Gérant" (bootstrap — il faut bien un premier Gérant pour
-- pouvoir ensuite attribuer les autres rôles depuis la page "Mes
-- informations" > "Rôles de l'équipe"). Tous les autres utilisateurs
-- restent au défaut "Collaborateur" tant que Louis ne les change pas
-- lui-même depuis cette page.
update public.profils_utilisateurs
set role = 'Gérant'
where email = 'lserayet@partenaires-particuliers.com';

-- ── Protection anti auto-promotion ──────────────────────────────────
-- La policy d'auto-édition existante (profils_utilisateurs_update_self,
-- voir profils_utilisateurs_migration.sql) permet à chacun de modifier SA
-- PROPRE ligne (nom/téléphone, depuis "Mes informations") — sans garde-fou
-- supplémentaire, rien n'empêcherait un appel direct (hors UI) d'inclure
-- aussi "role" dans la même requête et de s'auto-promouvoir Gérant. On
-- bloque ça au niveau trigger plutôt que policy : RLS ne distingue pas les
-- colonnes à l'intérieur d'une ligne (USING/WITH CHECK s'évaluent sur la
-- ligne entière), un trigger BEFORE UPDATE peut lui comparer OLD.role et
-- NEW.role et annuler silencieusement tout changement de role tenté par
-- quelqu'un qui n'est pas déjà Gérant.
create or replace function public.profils_utilisateurs_proteger_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profils_utilisateurs
      where user_id = auth.uid() and role = 'Gérant'
    ) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists avant_maj_profils_utilisateurs_role on public.profils_utilisateurs;
create trigger avant_maj_profils_utilisateurs_role
  before update on public.profils_utilisateurs
  for each row execute function public.profils_utilisateurs_proteger_role();

-- ── Fonctions d'administration (réservées au rôle Gérant) ───────────
-- profils_utilisateurs ne contient une ligne que pour les utilisateurs
-- déjà passés par "Mes informations" au moins une fois — un collaborateur
-- qui vient d'être invité et ne s'est connecté qu'une fois peut ne pas en
-- avoir. Pour que Louis puisse quand même lui attribuer un rôle depuis la
-- page "Rôles de l'équipe", ces deux fonctions passent par auth.users
-- (SECURITY DEFINER : seule façon pour le front de lire auth.users, pas
-- accessible directement via l'API publique Supabase) et vérifient
-- elles-mêmes que l'appelant est Gérant plutôt que de s'appuyer sur RLS.
-- `returns table (user_id uuid, ...)` crée des paramètres de sortie
-- implicites de ces noms, visibles dans tout le corps de la fonction —
-- d'où l'alias `pu` dans le test ci-dessous, sans quoi `user_id`/`role`
-- redeviennent ambigus avec la colonne de profils_utilisateurs.
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

create or replace function public.definir_role_utilisateur(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not exists (select 1 from public.profils_utilisateurs where user_id = auth.uid() and role = 'Gérant') then
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

-- ── Vérification ─────────────────────────────────────────────────────
select user_id, email, nom, role from public.profils_utilisateurs order by email;
