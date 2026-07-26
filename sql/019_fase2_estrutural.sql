-- Fase 2 da auditoria RevOps — estrutural. Migração aditiva, nenhuma tabela/coluna
-- existente é removida. Rode tudo de uma vez.

-- ==========================================================
-- 7) Histórico de mudança de etapa
-- ==========================================================
create table if not exists oportunidade_historico_etapa (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades(id) on delete cascade,
  etapa_anterior text,
  etapa_nova text not null,
  data_mudanca timestamptz not null default now(),
  usuario text
);

create index if not exists idx_historico_etapa_oportunidade on oportunidade_historico_etapa(oportunidade_id);

-- Grava automaticamente toda mudança de etapa, seja manual (modal/drag) ou via automações —
-- garante que nada escapa do histórico independente do caminho de código que atualizou a linha.
create or replace function registrar_historico_etapa()
returns trigger as $$
begin
  if tg_op = 'INSERT' or new.etapa_atual is distinct from old.etapa_atual then
    insert into oportunidade_historico_etapa (oportunidade_id, etapa_anterior, etapa_nova)
    values (new.id, case when tg_op = 'INSERT' then null else old.etapa_atual end, new.etapa_atual);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_historico_etapa on oportunidades;
create trigger trg_historico_etapa
  after insert or update on oportunidades
  for each row execute function registrar_historico_etapa();

-- ==========================================================
-- 8) Snapshot histórico do pipeline (alimentado por cron diário)
-- ==========================================================
create table if not exists pipeline_snapshot (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  etapa text not null,
  tipo_pipeline text not null default 'comercial',
  valor_total numeric(12,2) not null default 0,
  valor_ponderado numeric(12,2) not null default 0,
  qtd int not null default 0,
  criado_em timestamptz not null default now()
);

create unique index if not exists idx_pipeline_snapshot_dia_etapa on pipeline_snapshot(data, etapa, tipo_pipeline);

-- ==========================================================
-- 10) Separar funil Comercial de Customer Success
-- ==========================================================
alter table etapas_funil add column if not exists tipo_pipeline text not null default 'comercial'
  check (tipo_pipeline in ('comercial', 'cs'));

update etapas_funil set tipo_pipeline = 'cs'
  where nome in ('Onboarding', 'Adoção', 'Expansão', 'Indicação', 'Renovação');

alter table oportunidades add column if not exists tipo_pipeline text not null default 'comercial'
  check (tipo_pipeline in ('comercial', 'cs'));

-- linhas já existentes nas etapas de CS passam a ficar marcadas corretamente
update oportunidades o set tipo_pipeline = 'cs'
  from etapas_funil ef
  where ef.nome = o.etapa_atual and ef.tipo_pipeline = 'cs' and o.tipo_pipeline = 'comercial';

-- Ao fechar uma oportunidade Comercial (Contrato Fechado), cria automaticamente o
-- registro correspondente no pipeline de CS, já em Onboarding, copiando empresa/valor/GC.
create or replace function criar_oportunidade_cs_ao_fechar()
returns trigger as $$
begin
  if new.tipo_pipeline = 'comercial'
     and new.etapa_atual = 'Contrato Fechado'
     and (tg_op = 'INSERT' or old.etapa_atual is distinct from new.etapa_atual)
     and not exists (
       select 1 from oportunidades
       where empresa_id = new.empresa_id and tipo_pipeline = 'cs' and criado_em >= new.atualizado_em - interval '1 minute'
     )
  then
    insert into oportunidades (empresa_id, projeto, valor_estimado, etapa_atual, gc_responsavel_id, tipo_pipeline, ultima_interacao)
    values (new.empresa_id, new.projeto, new.valor_estimado, 'Onboarding', new.gc_responsavel_id, 'cs', current_date);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_criar_oportunidade_cs on oportunidades;
create trigger trg_criar_oportunidade_cs
  after insert or update on oportunidades
  for each row execute function criar_oportunidade_cs_ao_fechar();

-- ==========================================================
-- 12) Permissionamento por papel
-- ==========================================================
alter table gcs add column if not exists role text not null default 'comercial'
  check (role in ('gestor', 'comercial', 'sem_acesso'));

-- Ajuste manual: depois de rodar, defina quem é gestor, por exemplo:
-- update gcs set role = 'gestor' where email = 'caio.gadelha@admsolucoes.com.br';

-- ==========================================================
-- 13) Health Score e NPS pós-venda
-- ==========================================================
alter table oportunidades add column if not exists health_score int check (health_score between 0 and 100);

create table if not exists nps_respostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nota int not null check (nota between 0 and 10),
  comentario text,
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

create index if not exists idx_nps_empresa on nps_respostas(empresa_id);

alter table oportunidade_historico_etapa enable row level security;
alter table pipeline_snapshot enable row level security;
alter table nps_respostas enable row level security;

drop policy if exists "acesso liberado historico_etapa" on oportunidade_historico_etapa;
create policy "acesso liberado historico_etapa" on oportunidade_historico_etapa for all to public using (true) with check (true);

drop policy if exists "acesso liberado pipeline_snapshot" on pipeline_snapshot;
create policy "acesso liberado pipeline_snapshot" on pipeline_snapshot for all to public using (true) with check (true);

drop policy if exists "acesso liberado nps_respostas" on nps_respostas;
create policy "acesso liberado nps_respostas" on nps_respostas for all to public using (true) with check (true);
