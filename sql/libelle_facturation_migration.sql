-- libelle_facturation_migration.sql
-- Certains clients "grand compte" (ex: gestionnaires d'actifs type Swiss
-- Life AM) imposent un libellé de facturation précis — une entité/adresse
-- de facturation différente de leur fiche client standard, parfois avec un
-- code de routage pour leur plateforme de facturation électronique — qui
-- doit apparaître tel quel sur chaque facture client, sans qu'on ait à le
-- ressaisir à chaque fois.
--
-- Texte libre, multi-lignes, sur la fiche CLIENT (pas sur chaque facture
-- individuellement) : rempli une fois, repris automatiquement sur toutes
-- les factures futures de ce client. Voir lib/pdfFacture.js
-- (genererFactureCliPDF) : quand rempli, remplace entièrement le nom +
-- l'adresse habituellement affichés dans le bloc destinataire de la
-- facture — exactement le texte demandé par le client, ligne par ligne.

alter table public.clients add column if not exists libelle_facturation text;

comment on column public.clients.libelle_facturation is
  'Texte libre multi-lignes affiché à la place du nom+adresse standard sur le bloc destinataire des factures client de ce client, quand rempli (ex: entité de facturation différente, mentions "C/O ...", code de routage e-facturation imposés par le client). Une ligne par ligne du texte saisi.';

-- ── Vérification ─────────────────────────────────────────────────────
select id, nom, libelle_facturation from public.clients order by nom limit 20;
