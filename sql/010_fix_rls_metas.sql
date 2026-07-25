-- Corrige RLS da tabela metas de forma definitiva (política permissiva,
-- não depende de "disable row level security" que está sendo reativado
-- automaticamente pela plataforma).
alter table metas enable row level security;

drop policy if exists "allow all metas" on metas;
create policy "allow all metas" on metas for all using (true) with check (true);

-- Confirma que a constraint de unicidade existe (necessária pro upsert funcionar)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'metas_gc_id_mes_ano_key'
  ) then
    alter table metas add constraint metas_gc_id_mes_ano_key unique (gc_id, mes, ano);
  end if;
end $$;
