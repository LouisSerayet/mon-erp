# Scripts SQL — mon-erp

Scripts à exécuter manuellement dans Supabase → SQL Editor. Aucun n'est exécuté automatiquement par l'app.

| Fichier | Statut | Description |
|---|---|---|
| `01_backfill_prevu_lignes.sql` | ✅ Déjà exécuté | Recopie les lignes de devis vers les projets créés depuis un devis accepté (bug corrigé depuis dans le code). |
| `02_sync_montant_ht_global.sql` | ✅ Déjà exécuté | Resynchronise le CA (`montant_ht`) des projets à partir de leurs lignes (lots + lignes sans lot). |
| `03_rls_activation.sql` | ⏳ À exécuter | Active la sécurité (RLS) sur toutes les tables — à lancer seulement après avoir créé ton compte de connexion et vérifié que tu arrives à te connecter. |
| `pennylane_migration.sql` | ⏸ En pause | Colonnes pour l'intégration Pennylane (retirée du code pour l'instant). À ne lancer que si/quand Pennylane est rebranché. |
