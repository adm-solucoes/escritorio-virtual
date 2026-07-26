-- Fase I — Log de auditoria. Migração aditiva.
-- Cobre: etapa da oportunidade, campos de empresa (ICP/Temperatura/GC responsável),
-- e exclusões de empresas/oportunidades/atividades. Gravado via trigger (garante
-- captura independente do caminho de código, mesmo padrão do histórico de etapa).
-- Limitação conhecida: "usuario" fica null (triggers de banco não têm acesso à sessão
-- do app, já que o acesso hoje é via anon key sem contexto de auth.uid() — mesma
-- limitação documentada em oportunidade_historico_etapa.usuario).

create table if not exists log_alteracoes (
  id uuid primary key default gen_random_uuid(),
  registro_tipo text not null,
  registro_id uuid not null,
  campo_alterado text not null,
  valor_anterior text,
  valor_novo text,
  usuario text,
  data timestamptz not null default now()
);

create index if not exists idx_log_alteracoes_registro on log_alteracoes(registro_tipo, registro_id);

alter table log_alteracoes enable row level security;
drop policy if exists "acesso liberado log_alteracoes" on log_alteracoes;
create policy "acesso liberado log_alteracoes" on log_alteracoes for all to public using (true) with check (true);

-- ==========================================================
-- Empresas: ICP, Temperatura, GC responsável, exclusão
-- ==========================================================
create or replace function log_alteracoes_empresas()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values ('empresa', old.id, 'Exclusão', old.nome_empresa, null);
    return old;
  end if;

  if new.icp is distinct from old.icp then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values ('empresa', new.id, 'ICP', old.icp, new.icp);
  end if;
  if new.temperatura is distinct from old.temperatura then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values ('empresa', new.id, 'Temperatura', old.temperatura, new.temperatura);
  end if;
  if new.gc_responsavel_id is distinct from old.gc_responsavel_id then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values (
      'empresa', new.id, 'GC responsável',
      (select nome from gcs where id = old.gc_responsavel_id),
      (select nome from gcs where id = new.gc_responsavel_id)
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_log_alteracoes_empresas on empresas;
create trigger trg_log_alteracoes_empresas
  after update or delete on empresas
  for each row execute function log_alteracoes_empresas();

-- ==========================================================
-- Oportunidades: etapa, exclusão
-- ==========================================================
create or replace function log_alteracoes_oportunidades()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values ('oportunidade', old.id, 'Exclusão', old.projeto, null);
    return old;
  end if;

  if new.etapa_atual is distinct from old.etapa_atual then
    insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
    values ('oportunidade', new.id, 'Etapa', old.etapa_atual, new.etapa_atual);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_log_alteracoes_oportunidades on oportunidades;
create trigger trg_log_alteracoes_oportunidades
  after update or delete on oportunidades
  for each row execute function log_alteracoes_oportunidades();

-- ==========================================================
-- Atividades: exclusão
-- ==========================================================
create or replace function log_exclusao_atividades()
returns trigger as $$
begin
  insert into log_alteracoes (registro_tipo, registro_id, campo_alterado, valor_anterior, valor_novo)
  values ('atividade', old.id, 'Exclusão', old.tipo_atividade, null);
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_log_exclusao_atividades on atividades;
create trigger trg_log_exclusao_atividades
  after delete on atividades
  for each row execute function log_exclusao_atividades();
