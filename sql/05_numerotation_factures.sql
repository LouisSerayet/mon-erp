-- 05_numerotation_factures.sql
-- Numérotation séquentielle et non modifiable des factures CLIENTS.
--
-- La loi impose que les factures émises par l'entreprise (factures clients)
-- suivent une suite chronologique continue, sans trou ni doublon. Jusqu'ici
-- le numéro était un champ texte libre saisi à la main — rien n'empêchait
-- un doublon ou un oubli. Ce script met en place une génération automatique
-- et atomique du numéro suivant.
--
-- Les factures FOURNISSEURS (factures_frs) ne sont PAS concernées : leur
-- numéro est attribué par le fournisseur lui-même, pas par nous — il doit
-- rester un champ libre reflétant ce qui est écrit sur leur facture.

-- 1) Compteur par année (permet de repartir à 001 chaque nouvelle année,
--    comme le format déjà utilisé : F-2026-001, F-2027-001, ...).
create table if not exists public.compteurs_facturation (
  annee integer primary key,
  dernier_numero integer not null default 0
);

alter table public.compteurs_facturation enable row level security;

drop policy if exists "compteurs_facturation_authenticated" on public.compteurs_facturation;
create policy "compteurs_facturation_authenticated" on public.compteurs_facturation
  for all to authenticated using (true) with check (true);

-- 2) Initialise le compteur de l'année en cours à partir des numéros déjà
--    saisis manuellement au format 'F-AAAA-NNN', pour ne pas produire de
--    doublon avec l'historique existant. Si aucun numéro existant ne suit
--    ce format, le compteur démarre simplement à 0 (donc à 001 au premier
--    appel).
insert into public.compteurs_facturation (annee, dernier_numero)
select
  extract(year from now())::int,
  coalesce(max( (regexp_match(numero, '^F-(\d{4})-(\d+)$'))[2]::int ), 0)
from public.factures_cli
where numero ~ ('^F-' || extract(year from now())::text || '-\d+$')
on conflict (annee) do update
  set dernier_numero = greatest(compteurs_facturation.dernier_numero, excluded.dernier_numero);

-- 3) Fonction appelée par l'app à chaque création de facture client.
--    L'UPDATE ... RETURNING est atomique : même si deux factures sont
--    créées au même instant, chacune reçoit un numéro différent.
create or replace function public.next_facture_numero()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  annee_courante integer := extract(year from now())::int;
  numero_suivant integer;
begin
  insert into public.compteurs_facturation (annee, dernier_numero)
  values (annee_courante, 1)
  on conflict (annee) do update set dernier_numero = compteurs_facturation.dernier_numero + 1
  returning dernier_numero into numero_suivant;

  return 'F-' || annee_courante || '-' || lpad(numero_suivant::text, 3, '0');
end;
$$;

grant execute on function public.next_facture_numero() to authenticated;

-- Vérification : lance ceci après exécution pour voir le compteur en place.
-- select * from public.compteurs_facturation;
