-- Ação Rápida: bot de comando por texto (regex, sem IA) pra marcar reunião e já
-- disparar e-mail + WhatsApp de confirmação, com memória de contatos e motivos usados.

create extension if not exists pg_trgm;

create table if not exists acao_rapida_contatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text,
  empresa_id uuid references empresas(id) on delete set null,
  ultima_vez_usado timestamptz not null default now(),
  quantidade_usos int not null default 1,
  criado_em timestamptz not null default now()
);

create unique index if not exists idx_acao_rapida_contatos_email on acao_rapida_contatos (lower(email));
create index if not exists idx_acao_rapida_contatos_nome on acao_rapida_contatos using gin (nome gin_trgm_ops);

create table if not exists acao_rapida_motivos_recentes (
  id uuid primary key default gen_random_uuid(),
  motivo text not null,
  quantidade_usos int not null default 1,
  ultima_vez_usado timestamptz not null default now()
);

create unique index if not exists idx_acao_rapida_motivos_texto on acao_rapida_motivos_recentes (lower(motivo));

create table if not exists acao_rapida_execucoes (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid references acao_rapida_contatos(id) on delete set null,
  empresa_id uuid references empresas(id) on delete set null,
  oportunidade_id uuid references oportunidades(id) on delete set null,
  atividade_id uuid references atividades(id) on delete set null,
  canal text not null check (canal in ('calendario', 'email', 'whatsapp')),
  resultado text not null check (resultado in ('sucesso', 'erro')),
  detalhes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_acao_rapida_execucoes_contato on acao_rapida_execucoes(contato_id);

alter table acao_rapida_contatos enable row level security;
alter table acao_rapida_motivos_recentes enable row level security;
alter table acao_rapida_execucoes enable row level security;

drop policy if exists "acesso liberado acao_rapida_contatos" on acao_rapida_contatos;
create policy "acesso liberado acao_rapida_contatos" on acao_rapida_contatos for all to public using (true) with check (true);

drop policy if exists "acesso liberado acao_rapida_motivos_recentes" on acao_rapida_motivos_recentes;
create policy "acesso liberado acao_rapida_motivos_recentes" on acao_rapida_motivos_recentes for all to public using (true) with check (true);

drop policy if exists "acesso liberado acao_rapida_execucoes" on acao_rapida_execucoes;
create policy "acesso liberado acao_rapida_execucoes" on acao_rapida_execucoes for all to public using (true) with check (true);
