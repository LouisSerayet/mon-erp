-- droits_roles_migration.sql
-- Deuxième brique du système de rôles (voir roles_utilisateurs_migration.sql) :
-- une page où Louis (Gérant) attribue lui-même, pour chaque rôle, les
-- droits activés — sans repasser par du code à chaque nouvelle règle.
--
-- Une ligne par (rôle, droit) plutôt qu'une colonne par droit : ça permet
-- d'ajouter un nouveau droit plus tard (dans src/lib/droits.js) sans
-- nouvelle migration de schéma, juste une ligne insérée. RLS plutôt que
-- des fonctions SECURITY DEFINER : pas besoin ici de lire auth.users
-- (contrairement à roles_utilisateurs_migration.sql), une simple policy
-- suffit — et ça évite les pièges PL/pgSQL rencontrés sur l'autre
-- migration (ambiguïté de nom, cast de type).

create table if not exists public.droits_roles (
  role text not null,
  droit text not null,
  actif boolean not null default false,
  primary key (role, droit)
);

alter table public.droits_roles enable row level security;

-- Lecture ouverte à tout utilisateur connecté : chacun doit pouvoir savoir
-- ce que SON rôle a le droit de faire pour afficher/masquer les actions
-- correspondantes dans l'appli (même principe que profils_utilisateurs).
drop policy if exists droits_roles_select_all on public.droits_roles;
create policy droits_roles_select_all on public.droits_roles
  for select using (auth.role() = 'authenticated');

-- Écriture (changer un droit) réservée au rôle Gérant.
drop policy if exists droits_roles_write_gerant on public.droits_roles;
create policy droits_roles_write_gerant on public.droits_roles
  for all using (
    exists (select 1 from public.profils_utilisateurs pu where pu.user_id = auth.uid() and pu.role = 'Gérant')
  )
  with check (
    exists (select 1 from public.profils_utilisateurs pu where pu.user_id = auth.uid() and pu.role = 'Gérant')
  );

-- Catalogue initial — doit rester synchronisé avec src/lib/droits.js.
-- Par défaut : tout activé pour Gérant, rien pour les autres rôles —
-- Louis ajuste ensuite lui-même depuis "Droits par rôle" (Mes informations).
-- on conflict do nothing : une ré-exécution de cette migration n'écrase
-- jamais un réglage déjà fait par Louis via l'UI.
insert into public.droits_roles (role, droit, actif)
select r.role, d.droit, (r.role = 'Gérant')
from (values ('Gérant'), ('Associé'), ('Collaborateur'), ('Stagiaire')) as r(role)
cross join (values
  ('facturation_client'),
  ('pennylane'),
  ('commande_creation'),
  ('commande_validation'),
  ('commande_modification'),
  ('facture_frs_validation'),
  ('rapprochement_modification'),
  ('financier_acces')
) as d(droit)
on conflict (role, droit) do nothing;

-- ── Vérification ─────────────────────────────────────────────────────
select role, droit, actif from public.droits_roles order by role, droit;
