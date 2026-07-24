alter table configuracoes_relatorio
  add column if not exists incluir_vendas boolean not null default true,
  add column if not exists incluir_perdas boolean not null default true,
  add column if not exists incluir_origem boolean not null default true,
  add column if not exists incluir_responsavel boolean not null default true,
  add column if not exists incluir_evolucao boolean not null default true;
