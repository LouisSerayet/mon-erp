-- Ajoute les conditions de paiement (délai en jours + "fin de mois") aux
-- clients et fournisseurs, pour calculer automatiquement la date d'échéance
-- d'une facture à partir de sa date d'émission — voir calculerEcheance dans
-- src/lib/calculs.js, utilisée dans ProjetDetail.jsx sur les onglets
-- "Factures fournisseurs" et "Factures clients" (nouvelle facture + édition
-- inline d'une facture existante). L'échéance calculée reste modifiable à
-- la main, mais une validation (confirmation) est demandée avant de
-- l'écraser manuellement — voir le bouton 🔓 / la confirmation dans
-- ProjetDetail.jsx.
--
-- `delai_paiement_jours` : nombre de jours net après la date de facture
-- (0 = comptant, 30 = "30 jours net", etc.)
-- `delai_paiement_fin_mois` : si vrai, l'échéance calculée (date de facture
-- + délai en jours) est reportée au dernier jour de ce mois-là — pratique
-- courante ("30 jours fin de mois").
--
-- Défaut : 30 jours net, pas de report fin de mois (délai le plus courant).
-- N'affecte aucune facture déjà créée : les colonnes date_echeance
-- existantes ne sont pas recalculées par cette migration.
-- Ne concerne PAS les dépenses générales (depenses_generales), qui restent
-- volontairement hors de ce calcul automatique.

alter table clients add column if not exists delai_paiement_jours integer not null default 30;
alter table clients add column if not exists delai_paiement_fin_mois boolean not null default false;

alter table fournisseurs add column if not exists delai_paiement_jours integer not null default 30;
alter table fournisseurs add column if not exists delai_paiement_fin_mois boolean not null default false;

-- Vérification : doit renvoyer 30 / false pour tous les clients/fournisseurs existants.
select id, nom, delai_paiement_jours, delai_paiement_fin_mois from clients limit 50;
select id, nom, delai_paiement_jours, delai_paiement_fin_mois from fournisseurs limit 50;
