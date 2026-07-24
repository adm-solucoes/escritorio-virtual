-- Módulo de solicitações internas, vinculadas a uma oportunidade
create table if not exists solicitacoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades(id) on delete cascade,
  nome_evento_projeto text not null,
  objetivo text,
  tipo_apoio text[] not null default '{}',
  tipo_apoio_outro text,
  justificativa text,
  data_evento date,
  prazo date,
  responsavel_solicitacao_id uuid references gcs(id),
  recursos_necessarios text,
  email_responsavel_atendimento text not null,
  status text not null default 'Pendente' check (status in ('Pendente', 'Em andamento', 'Atendida', 'Recusada')),
  data_solicitacao timestamptz not null default now(),
  data_resposta timestamptz
);

create index if not exists idx_solicitacoes_oportunidade on solicitacoes(oportunidade_id);

alter table solicitacoes disable row level security;
