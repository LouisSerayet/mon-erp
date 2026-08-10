-- ============================================================
-- Sécurisation de l'ERP : active la Row Level Security (RLS) sur
-- toutes les tables et n'autorise l'accès qu'aux utilisateurs
-- connectés (authenticated) — plus aucun accès anonyme, même en
-- passant directement par l'API/la clé publique.
--
-- ⚠️ IMPORTANT : crée d'abord ton compte de connexion (voir les
-- instructions à part) et vérifie que tu arrives bien à te
-- connecter sur l'ERP AVANT d'exécuter ce script, sinon tu perds
-- l'accès en même temps que tout le monde.
--
-- À exécuter dans Supabase → SQL Editor, en une fois.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'clients', 'fournisseurs', 'projets', 'projet_lignes',
    'commandes', 'factures_frs', 'factures_cli', 'devis', 'devis_lignes'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated_full_access" on %I;', t);
    execute format(
      'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      t
    );
  end loop;
end $$;

-- ── Stockage (documents : devis, factures, pièces jointes...) ──
-- Restreint le bucket "documents" aux utilisateurs connectés.
-- Si un accès public/anonyme existait déjà sur ce bucket, vérifie
-- dans Supabase → Storage → Policies qu'aucune autre policy plus
-- permissive ne subsiste (les policies s'additionnent : la plus
-- permissive gagne).
drop policy if exists "authenticated_full_access_documents" on storage.objects;
create policy "authenticated_full_access_documents" on storage.objects
  for all
  using (bucket_id = 'documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');

-- ── Vérification ────────────────────────────────────────────
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('clients', 'fournisseurs', 'projets', 'projet_lignes', 'commandes', 'factures_frs', 'factures_cli', 'devis', 'devis_lignes')
order by tablename;
