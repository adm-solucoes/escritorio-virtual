-- CRM ADM Soluções — schema inicial
-- Rodar no Supabase: SQL Editor > New query > colar e Run

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ==========================================================
-- GCs (gerentes de conta)
-- ==========================================================
create table gcs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  ordem_round_robin int not null default 0,
  criado_em timestamptz not null default now()
);

-- ==========================================================
-- Empresas
-- ==========================================================
create table empresas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique, -- ex: EMP-0001, mantido da planilha original
  nome_empresa text not null,
  cnpj text,
  segmento text,
  cidade text,
  estado text,
  nome_contato text,
  cargo text,
  telefone text,
  email text,
  origem_lead text,
  icp text check (icp in ('A', 'B', 'C')),
  temperatura text check (temperatura in ('Frio', 'Morno', 'Quente')),
  gc_responsavel_id uuid references gcs(id),
  data_cadastro date default current_date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_empresas_gc on empresas(gc_responsavel_id);

-- ==========================================================
-- Etapas do funil ampulheta (probabilidade e prazo de alerta configuráveis)
-- ==========================================================
create table etapas_funil (
  id serial primary key,
  nome text unique not null,
  ordem int not null,
  probabilidade numeric(5,2) not null, -- ex: 0.10 = 10%, 1.20 = 120%
  dias_alerta_followup int not null default 7 -- dias sem interação até gerar follow-up automático
);

insert into etapas_funil (nome, ordem, probabilidade, dias_alerta_followup) values
  ('Prospect', 1, 0.10, 5),
  ('Briefing', 2, 0.20, 5),
  ('Planejamento', 3, 0.30, 7),
  ('Validação', 4, 0.50, 7),
  ('Proposta', 5, 0.70, 5),
  ('Negociação', 6, 0.90, 5),
  ('Contrato Fechado', 7, 1.00, 14),
  ('Onboarding', 8, 1.00, 10),
  ('Adoção', 9, 1.00, 14),
  ('Expansão', 10, 1.20, 14),
  ('Indicação', 11, 0.00, 30),
  ('Renovação', 12, 1.00, 14),
  ('Perdido', 13, 0.00, 0);

-- ==========================================================
-- Oportunidades
-- ==========================================================
create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  codigo text unique, -- ex: OPP-0001
  empresa_id uuid not null references empresas(id) on delete cascade,
  projeto text,
  valor_estimado numeric(12,2),
  etapa_atual text not null default 'Prospect' references etapas_funil(nome),
  probabilidade numeric(5,2), -- copiada da etapa no momento, pode ser ajustada manualmente
  receita_ponderada numeric(12,2) generated always as (coalesce(valor_estimado, 0) * coalesce(probabilidade, 0)) stored,
  ultima_interacao date,
  proxima_acao text,
  data_proxima_acao date,
  gc_responsavel_id uuid references gcs(id),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_oportunidades_empresa on oportunidades(empresa_id);
create index idx_oportunidades_etapa on oportunidades(etapa_atual);
create index idx_oportunidades_gc on oportunidades(gc_responsavel_id);

-- ==========================================================
-- Atividades (núcleo do follow-up automático)
-- ==========================================================
create table atividades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  oportunidade_id uuid references oportunidades(id) on delete cascade,
  tipo_atividade text not null, -- Ligação, Reunião, E-mail, Follow-up automático, etc.
  responsavel_id uuid references gcs(id),
  status text not null default 'Pendente' check (status in ('Pendente', 'Em andamento', 'Concluído', 'Atrasado')),
  prazo date,
  data_criacao timestamptz not null default now(),
  alerta_disparado boolean not null default false
);

create index idx_atividades_oportunidade on atividades(oportunidade_id);
create index idx_atividades_status on atividades(status);

-- ==========================================================
-- Trigger: atualiza "atualizado_em" automaticamente
-- ==========================================================
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_empresas_atualizado
  before update on empresas
  for each row execute function set_atualizado_em();

create trigger trg_oportunidades_atualizado
  before update on oportunidades
  for each row execute function set_atualizado_em();

-- ==========================================================
-- Trigger: ao mudar a etapa de uma oportunidade, atualiza a probabilidade
-- automaticamente com base na tabela etapas_funil (se não foi ajustada manualmente)
-- ==========================================================
create or replace function set_probabilidade_por_etapa()
returns trigger as $$
begin
  if new.etapa_atual is distinct from old.etapa_atual or new.probabilidade is null then
    select probabilidade into new.probabilidade
    from etapas_funil where nome = new.etapa_atual;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_oportunidades_probabilidade
  before insert or update on oportunidades
  for each row execute function set_probabilidade_por_etapa();

-- ==========================================================
-- Follow-up automático: gera atividade "Pendente" quando uma oportunidade
-- fica sem interação por mais dias do que o configurado na etapa atual.
-- Rodar periodicamente via Supabase Edge Function + cron (pg_cron), ex: 1x por dia.
-- ==========================================================
create or replace function gerar_followups_automaticos()
returns void as $$
begin
  insert into atividades (empresa_id, oportunidade_id, tipo_atividade, responsavel_id, status, prazo, alerta_disparado)
  select
    o.empresa_id,
    o.id,
    'Follow-up automático (sem interação há ' || (current_date - o.ultima_interacao) || ' dias)',
    o.gc_responsavel_id,
    'Pendente',
    current_date,
    true
  from oportunidades o
  join etapas_funil ef on ef.nome = o.etapa_atual
  where o.etapa_atual not in ('Contrato Fechado', 'Perdido', 'Renovação')
    and o.ultima_interacao is not null
    and (current_date - o.ultima_interacao) >= ef.dias_alerta_followup
    and not exists (
      select 1 from atividades a
      where a.oportunidade_id = o.id
        and a.alerta_disparado = true
        and a.status = 'Pendente'
    );
end;
$$ language plpgsql;

-- Ativa a extensão pg_cron (disponível no Supabase) e agenda 1x por dia às 08:00 (UTC)
create extension if not exists pg_cron;
select cron.schedule('gerar-followups-diario', '0 8 * * *', $$select gerar_followups_automaticos();$$);
