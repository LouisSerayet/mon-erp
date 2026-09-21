-- ecritures_diverses_migration.sql
-- Certains mouvements Qonto ne sont ni une facture client, ni une facture
-- fournisseur, ni une dépense générale : un apport en capital, un emprunt
-- bancaire, un remboursement, une subvention... Jusqu'ici, la seule option
-- dans "Transactions non rapprochées" (Rapprochement.jsx) pour un crédit
-- était de créer une fausse "facture client" rattachée de force à un
-- projet, ce qui n'a pas de sens et fausserait le Chiffre d'affaires du
-- Compte de résultat.
--
-- Cette table permet de rapprocher ce type de transaction avec une
-- description claire et une catégorie dédiée, sans jamais passer par
-- factures_cli/factures_frs/depenses_generales (qui alimentent le CA, les
-- achats ou les dépenses du Compte de résultat — voir Resultat.jsx). Une
-- écriture ici n'a donc aucun impact sur le résultat : c'est un mouvement
-- de trésorerie "hors exploitation", volontairement laissé en dehors du
-- calcul du résultat net.
--
-- Contrairement à factures_cli/factures_frs/depenses_generales, il n'y a
-- pas de statut "À payer" : une écriture n'est créée qu'au moment où on la
-- rapproche d'une transaction Qonto déjà réalisée (pas de cycle de vie
-- "en attente"), donc pas de colonne "statut" ici.
--
-- Réutilise les mêmes conventions que le reste de l'app : suppression
-- douce (deleted_at, cf. 06_corbeille_soft_delete.sql), rapprochement
-- bancaire Qonto (cf. qonto_migration.sql / src/lib/rapprochement.js),
-- historique des modifications (cf. 07_historique_modifications.sql).
--
-- montant est signé (positif = entrée d'argent, négatif = sortie), comme
-- le mouvement bancaire Qonto qu'il décrit — contrairement à montant_ht
-- sur les autres tables qui est toujours positif, il n'y a ici ni notion
-- de TVA ni de sens imposé par le type de table.

create table if not exists public.ecritures_diverses (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  categorie text not null default 'Autre', -- 'Apport en capital' | 'Emprunt bancaire' | 'Remboursement' | 'Subvention' | 'Autre'
  montant numeric not null default 0,
  date_operation date,
  qonto_transaction_id text,
  qonto_matched_at timestamptz,
  qonto_match_confiance text, -- 'creation' (seule valeur possible pour l'instant, cf. Rapprochement.jsx)
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_ecritures_diverses_deleted_at on public.ecritures_diverses (deleted_at);
create index if not exists idx_ecritures_diverses_qonto_transaction_id on public.ecritures_diverses (qonto_transaction_id);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.ecritures_diverses enable row level security;
drop policy if exists "authenticated_full_access" on public.ecritures_diverses;
create policy "authenticated_full_access" on public.ecritures_diverses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Historique des modifications ────────────────────────────────────
-- Nécessite que 07_historique_modifications.sql ait déjà été exécuté
-- (la fonction public.audit_trigger_fn doit exister) — c'est déjà le cas
-- puisque la page "Historique" fonctionne déjà dans l'app.
drop trigger if exists audit_trg on public.ecritures_diverses;
create trigger audit_trg after insert or update or delete on public.ecritures_diverses
  for each row execute function public.audit_trigger_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'ecritures_diverses'
order by ordinal_position;
