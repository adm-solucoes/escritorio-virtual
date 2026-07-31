-- ==========================================================
-- ROLLBACK DE EMERGÊNCIA da migration 034 — USE SÓ SE O CRM PARAR
--
-- ATENÇÃO: rodar isto reabre o banco pra qualquer pessoa da internet
-- (é exatamente o buraco que a 034 fechou). Use apenas pra destravar o
-- time se algo quebrar, e me chame pra corrigir a política e refechar o
-- quanto antes — não deixe o banco assim.
-- ==========================================================

do $roll$
declare
  t record;
  p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    loop
      execute format('drop policy %I on public.%I', p.policyname, t.tablename);
    end loop;

    execute format(
      'create policy "acesso liberado" on public.%I for all to public '
      || 'using (true) with check (true)',
      t.tablename
    );
  end loop;
end
$roll$;

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
