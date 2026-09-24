-- projet_createur_migration.sql
-- Ajoute un simple suivi "qui a créé ce projet ?" (created_by_email) —
-- jusqu'ici invisible dans l'ERP, utile pour un suivi des dossiers par
-- utilisateur une fois qu'il y aura plusieurs personnes connectées (voir le
-- commentaire dans sql/email_send_log_migration.sql : l'ERP n'a qu'un seul
-- utilisateur de confiance pour l'instant).
--
-- Deux mécanismes, comme pour l'historique (sql/07_historique_modifications.sql) :
--   1) Un trigger BEFORE INSERT qui renseigne automatiquement l'email de
--      l'utilisateur connecté (auth.jwt() ->> 'email') à chaque nouveau
--      projet — aucune action requise côté app, ni aujourd'hui ni plus tard
--      quand un deuxième utilisateur arrivera.
--   2) Un rétro-remplissage pour les projets DÉJÀ existants : on va chercher
--      dans audit_log (actif depuis 07_historique_modifications.sql) la plus
--      ancienne entrée CREATION de chaque projet, qui contient déjà l'email
--      du créateur — donc pas de devinette. Pour les tout premiers projets,
--      créés avant que l'historique n'existe (s'il y en a), on retombe sur
--      l'unique utilisatrice/utilisateur de l'ERP jusqu'ici, forcément la
--      bonne réponse dans ce cas.
--
-- ⚠️ Avant d'exécuter, remplace l'adresse ci-dessous si besoin (recherche
-- "lserayet@partenaires-particuliers.com" dans ce fichier) — c'est l'email
-- de repli utilisé uniquement pour les projets sans trace dans audit_log.

alter table public.projets add column if not exists created_by_email text;

-- Rétro-remplissage depuis l'historique existant.
update public.projets p
set created_by_email = sub.changed_by
from (
  select distinct on (record_id) record_id, changed_by
  from public.audit_log
  where table_name = 'projets' and action = 'CREATION'
  order by record_id, changed_at asc
) sub
where sub.record_id = p.id::text
  and p.created_by_email is null;

-- Repli pour les projets sans aucune trace dans audit_log (créés avant sa
-- mise en place) — unique utilisateur de l'ERP jusqu'ici.
update public.projets
set created_by_email = 'lserayet@partenaires-particuliers.com'
where created_by_email is null;

-- Auto-renseignement à la création, pour tout nouveau projet — même
-- principe que audit_trigger_fn (07_historique_modifications.sql), mais un
-- trigger BEFORE INSERT dédié (pas AFTER) puisqu'on modifie la ligne
-- elle-même plutôt que d'écrire dans une table séparée.
create or replace function public.set_projet_createur_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_email is null then
    new.created_by_email := coalesce(auth.jwt() ->> 'email', 'système');
  end if;
  return new;
end;
$$;

drop trigger if exists set_projet_createur_trg on public.projets;
create trigger set_projet_createur_trg
  before insert on public.projets
  for each row execute function public.set_projet_createur_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select id, nom, created_by_email, created_at from public.projets order by created_at desc limit 20;
