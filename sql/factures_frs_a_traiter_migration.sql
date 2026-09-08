-- ============================================================
-- Boîte de réception des factures fournisseurs reçues par email.
-- Louis transfère (ou fait transférer par ses fournisseurs) les emails de
-- facture vers une adresse dédiée (voir OUTLOOK_FACTURES_MAILBOX côté
-- Vercel) ; l'ERP va chercher ces emails à la demande (bouton "Vérifier
-- les nouvelles factures", voir api/import-factures-frs.js) et dépose ici
-- un brouillon par facture reçue, en tentant de retrouver automatiquement
-- le fournisseur (email expéditeur) et la commande concernée (numéro de
-- commande repéré dans le texte du PDF joint, voir genNumeroCommande côté
-- ProjetDetail.jsx — format "PP-<PROJET>-<NNN>").
--
-- Table volontairement séparée de factures_frs plutôt qu'un statut
-- "brouillon" dessus : factures_frs exige un projet (project_id not null,
-- cf. usage dans ProjetDetail.jsx) alors qu'à l'arrivée on ne sait pas
-- toujours à quel projet/commande rattacher la facture — et on ne veut
-- surtout pas qu'une facture non validée déclenche l'envoi automatique
-- vers Pennylane (voir envoyerFactureFrsAutoPennylane, déclenché à la
-- création d'une factures_frs). Une fois validée depuis la page "Boîte de
-- réception", une vraie ligne factures_frs est créée normalement (même
-- chemin que la création manuelle) et facture_frs_id est renseigné ici.

create table if not exists public.factures_frs_a_traiter (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique, -- id du message Microsoft Graph, empêche un doublon si le bouton "Vérifier" est cliqué plusieurs fois
  recu_le timestamptz,
  expediteur text,
  sujet text,
  fournisseur_id uuid references public.fournisseurs(id), -- pré-rempli si l'email expéditeur correspond à fournisseurs.email
  commande_id uuid references public.commandes(id), -- pré-rempli si un numéro de commande connu a été repéré dans le PDF
  projet_id uuid references public.projets(id), -- déduit de la commande trouvée (une commande appartient toujours à un projet)
  numero_commande_detecte text, -- texte brut repéré par la regex, même quand il ne correspond à aucune commande connue — utile pour comprendre pourquoi le rapprochement a échoué
  fichier_path text, -- PDF joint, déjà archivé dans le storage "documents" (même bucket que le reste de l'ERP)
  texte_extrait text, -- texte brut extrait du PDF, pour recherche manuelle si le rapprochement automatique échoue
  statut text not null default 'a_traiter', -- 'a_traiter' | 'traitee' | 'rejetee'
  alerte text, -- ex. "Aucun numéro de commande trouvé sur la facture — à faire corriger par le fournisseur."
  facture_frs_id uuid references public.factures_frs(id), -- renseigné une fois validée (voir BoiteReceptionFactures.jsx)
  created_at timestamptz not null default now(),
  traite_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_factures_frs_a_traiter_statut on public.factures_frs_a_traiter (statut);
create index if not exists idx_factures_frs_a_traiter_deleted_at on public.factures_frs_a_traiter (deleted_at);

-- ── Sécurité (RLS) — même politique que le reste de l'app ──────────────
alter table public.factures_frs_a_traiter enable row level security;
drop policy if exists "authenticated_full_access" on public.factures_frs_a_traiter;
create policy "authenticated_full_access" on public.factures_frs_a_traiter
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Historique des modifications ────────────────────────────────────
-- Nécessite que 07_historique_modifications.sql ait déjà été exécuté (la
-- fonction public.audit_trigger_fn doit exister) — c'est déjà le cas
-- puisque la page "Historique" fonctionne déjà dans l'app.
drop trigger if exists audit_trg on public.factures_frs_a_traiter;
create trigger audit_trg after insert or update or delete on public.factures_frs_a_traiter
  for each row execute function public.audit_trigger_fn();

-- ── Vérification ─────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'factures_frs_a_traiter'
order by ordinal_position;
