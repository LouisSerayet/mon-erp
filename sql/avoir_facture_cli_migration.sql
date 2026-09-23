-- avoir_facture_cli_migration.sql
-- Permet de créer des AVOIRS (factures d'avoir / credit notes) pour les
-- factures clients — jusqu'ici impossible : type_facture n'acceptait que
-- 'avancement'/'acompte' (voir sql/facture_cli_type_migration.sql), le
-- champ Montant HT refusait les valeurs négatives côté UI, et il n'existait
-- aucune numérotation dédiée.
--
-- Un avoir reste une ligne factures_cli comme les autres (type_facture =
-- 'avoir') : il vient donc naturellement en déduction du Chiffre d'affaires
-- et de la TVA collectée dans le Compte de résultat (Resultat.jsx, simple
-- somme de montant_ht, signe compris), et peut être suivi comme une facture
-- normale si besoin (rapprochement, Pennylane, Dashboard...). Son
-- montant_ht est enregistré NÉGATIF (voir ProjetDetail.jsx,
-- ajouterFactureCli) — la loi impose la même rigueur de numérotation
-- séquentielle sur les avoirs que sur les factures, d'où la série dédiée
-- AV-AAAA-NNN ci-dessous (continue et propre à elle, distincte de la série
-- F-AAAA-NNN des factures).
--
-- facture_origine_id / facture_origine_numero : référence optionnelle vers
-- la facture que cet avoir corrige (usage courant, pas obligatoire — un
-- avoir peut aussi être global/sans lien à une facture précise). Le numéro
-- est dupliqué en texte (snapshot au moment de la création) pour que le PDF
-- reste lisible même si la facture d'origine est un jour supprimée.

alter table factures_cli add column if not exists facture_origine_id uuid references factures_cli(id);
alter table factures_cli add column if not exists facture_origine_numero text;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'factures_cli_type_facture_check'
  ) then
    alter table factures_cli drop constraint factures_cli_type_facture_check;
  end if;
  alter table factures_cli
    add constraint factures_cli_type_facture_check
    check (type_facture in ('avancement', 'acompte', 'avoir'));
end $$;

-- Compteur dédié, même principe que compteurs_facturation (voir
-- sql/05_numerotation_factures.sql) mais série séparée AV-AAAA-NNN — pas de
-- backfill depuis l'historique existant puisqu'aucun avoir n'a jamais été
-- créé avant cette migration (le compteur démarre donc à 0 / 001).
create table if not exists public.compteurs_avoirs (
  annee integer primary key,
  dernier_numero integer not null default 0
);

alter table public.compteurs_avoirs enable row level security;

drop policy if exists "compteurs_avoirs_authenticated" on public.compteurs_avoirs;
create policy "compteurs_avoirs_authenticated" on public.compteurs_avoirs
  for all to authenticated using (true) with check (true);

-- Fonction appelée par l'app à chaque création d'avoir. L'UPDATE ...
-- RETURNING est atomique, même principe que next_facture_numero().
create or replace function public.next_avoir_numero()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  annee_courante integer := extract(year from now())::int;
  numero_suivant integer;
begin
  insert into public.compteurs_avoirs (annee, dernier_numero)
  values (annee_courante, 1)
  on conflict (annee) do update set dernier_numero = compteurs_avoirs.dernier_numero + 1
  returning dernier_numero into numero_suivant;

  return 'AV-' || annee_courante || '-' || lpad(numero_suivant::text, 3, '0');
end;
$$;

grant execute on function public.next_avoir_numero() to authenticated;

-- Vérification
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'factures_cli' and column_name in ('facture_origine_id', 'facture_origine_numero');
