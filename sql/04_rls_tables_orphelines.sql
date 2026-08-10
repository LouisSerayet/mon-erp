-- ============================================================
-- Ferme un vrai trou de sécurité : 5 tables existaient encore dans
-- Supabase sans RLS activée (badge "Unrestricted" dans le Table Editor),
-- ce qui les rendait lisibles/modifiables par n'importe qui sur internet
-- via la clé publique de l'app, sans connexion à l'ERP :
--
--   - commandes_fournisseurs   (ancienne table, remplacée par "commandes")
--   - factures_fournisseurs    (ancienne table, remplacée par "factures_frs")
--   - factures_clients         (ancienne table, remplacée par "factures_cli")
--   - devis_chapitres          (ancienne table, remplacée par "devis_lignes")
--   - devis_lots               (ancienne table, remplacée par "devis_lignes")
--
-- Aucune de ces 5 tables n'est utilisée par le code actuel de l'ERP (les
-- pages qui les utilisaient ont été supprimées). Ce script se contente
-- d'activer la même politique de sécurité que sur tes tables actives —
-- ça ne touche à aucune donnée, ça ferme juste l'accès public.
--
-- À exécuter dans Supabase → SQL Editor, en une fois.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'commandes_fournisseurs', 'factures_fournisseurs', 'factures_clients',
    'devis_chapitres', 'devis_lots'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table %I enable row level security;', t);
      execute format('drop policy if exists "authenticated_full_access" on %I;', t);
      execute format(
        'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
        t
      );
    end if;
  end loop;
end $$;

-- ── Vérification : les 5 tables doivent maintenant afficher "true" ──
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('commandes_fournisseurs', 'factures_fournisseurs', 'factures_clients', 'devis_chapitres', 'devis_lots')
order by tablename;
