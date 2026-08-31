-- Ajoute le type de facture client (avancement / acompte) et la case
-- "paiement comptant" associée — voir l'onglet "Factures clients" d'un
-- projet dans src/pages/ProjetDetail.jsx (formulaire "Nouvelle facture").
--
-- `type_facture` : 'avancement' (facture de situation/avancement classique,
-- comportement inchangé) ou 'acompte' (facture d'acompte). Choisi une seule
-- fois à la création de la facture, non modifiable ensuite (il faut
-- supprimer/recréer pour changer de type).
--
-- `paiement_comptant` : uniquement pertinent quand type_facture = 'acompte'
-- — coché, l'échéance de la facture est calculée à 0 jour (date d'échéance
-- = date de facture) au lieu des conditions de paiement du client
-- (clients.delai_paiement_jours), voir echeanceFcliAuto dans
-- ProjetDetail.jsx. Le PDF (titre "FACTURE D'ACOMPTE" + mention "payable
-- comptant" dans les conditions, voir lib/pdfI18n.js) et le suivi
-- (Dashboard, relances, trésorerie — qui lisent tous date_echeance)
-- reflètent alors automatiquement l'absence de délai de 30 jours.
--
-- Défaut : 'avancement' / non coché, pour ne rien changer aux factures déjà
-- créées ni au comportement existant.

alter table factures_cli add column if not exists type_facture text not null default 'avancement';
alter table factures_cli add column if not exists paiement_comptant boolean not null default false;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'factures_cli_type_facture_check'
  ) then
    alter table factures_cli drop constraint factures_cli_type_facture_check;
  end if;
  alter table factures_cli
    add constraint factures_cli_type_facture_check
    check (type_facture in ('avancement', 'acompte'));
end $$;

-- Vérification : doit renvoyer 'avancement' / false pour toutes les factures existantes.
select id, numero, type_facture, paiement_comptant from factures_cli order by created_at desc limit 50;
