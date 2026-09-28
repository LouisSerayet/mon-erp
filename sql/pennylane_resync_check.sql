-- ============================================================
-- Pennylane : repérer et corriger les factures que l'ERP croit
-- "jamais envoyées" (pennylane_synced_at NULL) mais qui sont en
-- réalité déjà arrivées chez Pennylane par email.
--
-- Contexte (28/09/2026) : un envoi groupé (page Exports) qui réussit
-- sur un premier lot d'e-mails puis échoue sur un lot suivant ne
-- marquait pennylane_synced_at qu'à la toute fin, sur TOUT le lot —
-- donc les factures du premier lot, pourtant bien envoyées, restaient
-- marquées "à envoyer" côté ERP. Au prochain envoi groupé, l'ERP les
-- renvoyait, créant un doublon chez Pennylane. Corrigé dans le code
-- (chaque lot est maintenant marqué envoyé juste après son propre
-- envoi, pas après la fin de tous les lots) — ce fichier sert à
-- rattraper les factures déjà touchées par l'ancien comportement.
--
-- Repéré via F-2026-029 (projet "Travaux cantine", La Cantine du 38) :
-- présente chez Pennylane ("Encaissée", 1 260,83 €) mais affichée "—"
-- (jamais envoyée) côté ERP.
--
-- À exécuter dans Supabase → SQL Editor.
-- ============================================================

-- 1) Étape 1 — diagnostic, ne modifie rien : liste toutes les factures
-- clients/fournisseurs que l'ERP croit non envoyées à Pennylane.
-- Compare chaque ligne à la liste réelle dans Pennylane (Ventes ou
-- Achats > Factures) : celles qui y figurent déjà sont les "vraies"
-- victimes du bug, à corriger avec l'étape 2 ci-dessous ; celles qui
-- n'y figurent pas sont légitimement "à envoyer" (rien à faire, elles
-- partiront au prochain envoi automatique ou groupé).
select 'facture_cli' as type, numero, date_facture, montant_ht, statut, pennylane_synced_at
from factures_cli
where deleted_at is null and pennylane_synced_at is null
union all
select 'facture_frs' as type, numero, date_facture, montant_ht, statut, pennylane_synced_at
from factures_frs
where deleted_at is null and pennylane_synced_at is null
order by date_facture;

-- 2) Étape 2 — correction ciblée, une fois la comparaison faite :
-- remplace la liste de numéros ci-dessous par ceux que tu as
-- confirmés comme déjà présents chez Pennylane (F-2026-029 déjà
-- inclus à titre d'exemple confirmé). N'invente jamais pennylane_invoice_id
-- (l'identifiant Pennylane) sans l'avoir sous les yeux dans Pennylane —
-- pennylane_statut/pennylane_synced_at suffisent à arrêter les
-- doublons, qui est le seul but ici.
update factures_cli
set pennylane_statut = 'Envoyée par email (rattrapage 28/09/2026)',
    pennylane_synced_at = now()
where numero in ('F-2026-029')
  and deleted_at is null;

-- Vérification
select numero, statut, pennylane_statut, pennylane_synced_at
from factures_cli
where numero in ('F-2026-029');
