-- projet_contact_migration.sql
-- Permet de choisir, par projet, QUEL contact du client est le bon
-- interlocuteur (demandé par Louis, nov. 2026 : un même compte client
-- — ex. ESA — peut avoir plusieurs personnes côté commercial, et le
-- contact pertinent peut changer d'un projet à l'autre).
--
-- S'appuie sur les contacts multiples déjà existants (table
-- client_contacts, voir sql/client_contacts_migration.sql et
-- ContactsMultiples.jsx) plutôt que de créer un nouveau système : un
-- projet pointe simplement vers l'un des contacts du client choisi, en
-- plus (pas à la place) des champs contact/email/telephone uniques de la
-- fiche client, qui restent le repli par défaut si aucun contact
-- spécifique n'est choisi pour ce projet.
--
-- "on delete set null" plutôt que cascade : si le contact choisi est
-- supprimé de la fiche client, le projet ne doit pas disparaître ni
-- bloquer la suppression — il retombe simplement sur le contact
-- principal du client (comportement actuel, inchangé).

alter table public.projets
  add column if not exists contact_id uuid references public.client_contacts(id) on delete set null;

create index if not exists idx_projets_contact_id on public.projets (contact_id);

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'projets' and column_name = 'contact_id';
