# Scripts SQL — mon-erp

Scripts à exécuter manuellement dans Supabase → SQL Editor. Aucun n'est exécuté automatiquement par l'app.

| Fichier | Statut | Description |
|---|---|---|
| `01_backfill_prevu_lignes.sql` | ✅ Déjà exécuté | Recopie les lignes de devis vers les projets créés depuis un devis accepté (bug corrigé depuis dans le code). |
| `02_sync_montant_ht_global.sql` | ✅ Déjà exécuté | Resynchronise le CA (`montant_ht`) des projets à partir de leurs lignes (lots + lignes sans lot). |
| `03_rls_activation.sql` | ✅ Déjà exécuté | Active la sécurité (RLS) sur toutes les tables — accès réservé aux utilisateurs connectés. Vérifié : connexion + accès aux données OK après activation. |
| `pennylane_migration.sql` | ✅ Déjà exécuté | Colonnes pour l'intégration Pennylane (adresses structurées, identifiants Pennylane, suivi de synchro). L'intégration code est en place mais le jeton API Pennylane n'est pas encore configuré sur Vercel — à faire plus tard avec l'expert-comptable. |
| `04_rls_tables_orphelines.sql` | ✅ Déjà exécuté | Active la RLS sur 5 anciennes tables trouvées sans sécurité (`commandes_fournisseurs`, `factures_fournisseurs`, `factures_clients`, `devis_chapitres`, `devis_lots`) — repérées lors de l'audit complet du code, elles étaient accessibles publiquement sans connexion. Aucune n'est utilisée par le code actuel. Vérifié : les 5 tables affichent `rowsecurity = true`. |
