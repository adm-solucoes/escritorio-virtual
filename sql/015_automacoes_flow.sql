-- Construtor visual de automações (canvas de nós conectados, regras fixas — sem IA).

create table if not exists automacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists automacao_nos (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references automacoes(id) on delete cascade,
  tipo text not null check (tipo in (
    'gatilho_etapa', 'gatilho_atividade_atrasada', 'gatilho_sem_contato', 'gatilho_data_hora',
    'condicao',
    'acao_whatsapp', 'acao_agendar_reuniao', 'acao_criar_atividade', 'acao_notificar_interno',
    'espera'
  )),
  posicao_x numeric not null default 0,
  posicao_y numeric not null default 0,
  config jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists automacao_conexoes (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references automacoes(id) on delete cascade,
  no_origem_id uuid not null references automacao_nos(id) on delete cascade,
  no_destino_id uuid not null references automacao_nos(id) on delete cascade,
  condicao text -- ex: 'sim' / 'nao' quando a origem é um nó de condição
);

create table if not exists automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid references automacoes(id) on delete set null,
  empresa_id uuid references empresas(id) on delete set null,
  oportunidade_id uuid references oportunidades(id) on delete set null,
  atividade_id uuid references atividades(id) on delete set null,
  no_id uuid references automacao_nos(id) on delete set null,
  executado_em timestamptz not null default now(),
  resultado text not null check (resultado in ('sucesso', 'erro', 'ignorado')),
  erro text
);

create index if not exists idx_automacao_nos_automacao on automacao_nos(automacao_id);
create index if not exists idx_automacao_conexoes_automacao on automacao_conexoes(automacao_id);
create index if not exists idx_automacao_conexoes_origem on automacao_conexoes(no_origem_id);
create index if not exists idx_automacao_execucoes_automacao on automacao_execucoes(automacao_id);

-- Um registro por GC que autorizou o acesso à própria conta Google (Calendar + Gmail).
-- Cada automação de agenda/e-mail roda com o token do GC responsável pela oportunidade/empresa.
create table if not exists integracoes_google (
  id uuid primary key default gen_random_uuid(),
  gc_id uuid not null references gcs(id) on delete cascade unique,
  email_google text not null,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table automacoes enable row level security;
alter table automacao_nos enable row level security;
alter table automacao_conexoes enable row level security;
alter table automacao_execucoes enable row level security;
alter table integracoes_google enable row level security;

drop policy if exists "acesso liberado automacoes" on automacoes;
create policy "acesso liberado automacoes" on automacoes for all to public using (true) with check (true);

drop policy if exists "acesso liberado automacao_nos" on automacao_nos;
create policy "acesso liberado automacao_nos" on automacao_nos for all to public using (true) with check (true);

drop policy if exists "acesso liberado automacao_conexoes" on automacao_conexoes;
create policy "acesso liberado automacao_conexoes" on automacao_conexoes for all to public using (true) with check (true);

drop policy if exists "acesso liberado automacao_execucoes" on automacao_execucoes;
create policy "acesso liberado automacao_execucoes" on automacao_execucoes for all to public using (true) with check (true);

-- integracoes_google guarda tokens sensíveis: mesmo com a chave anônima liberada (padrão do
-- resto do app), o client nunca deve consultar essa tabela direto — só rotas de servidor
-- (com a service key) leem/gravam token. Ainda assim deixamos a política padrão pra não quebrar
-- o modelo de acesso atual do projeto.
drop policy if exists "acesso liberado integracoes_google" on integracoes_google;
create policy "acesso liberado integracoes_google" on integracoes_google for all to public using (true) with check (true);
