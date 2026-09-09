-- ============================================================
-- Verrouillage des documents comptables (commandes fournisseurs, factures
-- clients, factures fournisseurs) une fois qu'ils sont figés :
--   - commande fournisseur : dès qu'elle passe "Validée"
--   - facture client       : dès qu'elle passe "Envoyée" (ou "Payée")
--   - facture fournisseur  : dès sa création (pas d'état "brouillon" côté
--                            achat — c'est déjà un document reçu du
--                            fournisseur)
-- Les modifier reste possible mais demande de saisir un motif (voir
-- ProjetDetail.jsx : editCmd/editFacCli/editFacFrs, tracerDeverrouillage) —
-- ce motif est stocké ici et apparaît donc automatiquement dans
-- l'Historique (audit_trg déjà en place sur ces 3 tables) comme toute
-- autre modification, sans mécanisme de traçabilité séparé à maintenir.
-- Le verrouillage lui-même n'a pas besoin d'être stocké : il se déduit du
-- statut (voir estVerrouille côté app) et le déverrouillage n'est valable
-- que pour la session en cours (re-demandé à la prochaine modification,
-- même après enregistrement) — ces deux colonnes ne servent qu'à
-- l'historique, pas à décider si un document est modifiable.

alter table public.commandes
  add column if not exists deverrouille_motif text,
  add column if not exists deverrouille_le timestamptz;

alter table public.factures_cli
  add column if not exists deverrouille_motif text,
  add column if not exists deverrouille_le timestamptz;

alter table public.factures_frs
  add column if not exists deverrouille_motif text,
  add column if not exists deverrouille_le timestamptz;

-- ── Vérification ─────────────────────────────────────────────────────
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and column_name in ('deverrouille_motif', 'deverrouille_le')
order by table_name, column_name;
