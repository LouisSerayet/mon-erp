-- profils_utilisateurs_migration.sql
-- Fiche "Mes informations" par utilisateur (nom + téléphone) — utilisée
-- pour afficher, sur les devis/factures/bons de commande, le contact du
-- créateur du projet (voir projets.created_by_email, mis en place par
-- projet_createur_migration.sql) plutôt que toujours les coordonnées de
-- Louis (ENTREPRISE.contact, src/lib/entreprise.js). Tant qu'un
-- utilisateur n'a pas renseigné sa fiche (ou pour un projet sans créateur
-- connu), le document retombe sur ENTREPRISE.contact — voir
-- src/lib/contacts.js.
--
-- user_id référence auth.users (un utilisateur = une fiche), mais la
-- recherche du contact d'un document se fait par email (via
-- projets.created_by_email) — d'où la colonne `email` dupliquée ici,
-- renseignée automatiquement à l'enregistrement (voir la page
-- "Mes informations", src/pages/Parametres.jsx).

create table if not exists public.profils_utilisateurs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom text,
  telephone text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profils_utilisateurs_email_idx on public.profils_utilisateurs (email);

alter table public.profils_utilisateurs enable row level security;

-- Lecture ouverte à tout utilisateur connecté : nécessaire pour qu'un
-- devis créé par un collègue affiche SON contact à lui même quand c'est
-- toi (ou l'inverse) qui régénères le PDF — même principe que le reste de
-- l'ERP (authenticated_full_access), voir email_send_log_migration.sql.
drop policy if exists profils_utilisateurs_select_all on public.profils_utilisateurs;
create policy profils_utilisateurs_select_all on public.profils_utilisateurs
  for select using (auth.role() = 'authenticated');

-- Écriture réservée à sa propre fiche.
drop policy if exists profils_utilisateurs_insert_self on public.profils_utilisateurs;
create policy profils_utilisateurs_insert_self on public.profils_utilisateurs
  for insert with check (auth.uid() = user_id);

drop policy if exists profils_utilisateurs_update_self on public.profils_utilisateurs;
create policy profils_utilisateurs_update_self on public.profils_utilisateurs
  for update using (auth.uid() = user_id);

-- Pré-remplissage de la fiche de Louis avec les coordonnées déjà utilisées
-- jusqu'ici (ENTREPRISE.contact) — pour que rien ne change tant qu'il n'a
-- pas explicitement modifié sa fiche depuis "Mes informations".
insert into public.profils_utilisateurs (user_id, email, nom, telephone)
select id, email, 'Louis Serayet', '06 11 24 50 39'
from auth.users
where email = 'lserayet@partenaires-particuliers.com'
on conflict (user_id) do nothing;

-- ── Vérification ─────────────────────────────────────────────────────
select user_id, email, nom, telephone, updated_at from public.profils_utilisateurs;
