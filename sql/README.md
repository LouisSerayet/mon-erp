# Scripts SQL — mon-erp

Scripts à exécuter manuellement dans Supabase → SQL Editor. Aucun n'est exécuté automatiquement par l'app.

| Fichier | Statut | Description |
|---|---|---|
| `01_backfill_prevu_lignes.sql` | ✅ Déjà exécuté | Recopie les lignes de devis vers les projets créés depuis un devis accepté (bug corrigé depuis dans le code). |
| `02_sync_montant_ht_global.sql` | ✅ Déjà exécuté | Resynchronise le CA (`montant_ht`) des projets à partir de leurs lignes (lots + lignes sans lot). |
| `03_rls_activation.sql` | ✅ Déjà exécuté | Active la sécurité (RLS) sur toutes les tables — accès réservé aux utilisateurs connectés. Vérifié : connexion + accès aux données OK après activation. |
| `pennylane_migration.sql` | ✅ Déjà exécuté | Colonnes pour l'intégration Pennylane (adresses structurées, identifiants Pennylane, suivi de synchro). L'intégration code est en place mais le jeton API Pennylane n'est pas encore configuré sur Vercel — à faire plus tard avec l'expert-comptable. |
| `qonto_migration.sql` | ⏳ À exécuter | Colonnes pour le rapprochement Qonto <-> factures clients/fournisseurs (`qonto_transaction_id`, `qonto_matched_at`, `qonto_match_confiance`) — nécessaire avant d'utiliser la page "Rapprochement" ou les boutons "Vérifier sur Qonto" d'un projet. |
| `depenses_generales_migration.sql` | ⏳ À exécuter | Crée la table `depenses_generales` (loyer, comptabilité, assurance, abonnements...) utilisée par la nouvelle page "Dépenses" — dépenses de la société non liées à un projet client. Inclut RLS, suppression douce (Corbeille) et rapprochement Qonto. Nécessite que `06_corbeille_soft_delete.sql` et `07_historique_modifications.sql` aient déjà été exécutés. |
