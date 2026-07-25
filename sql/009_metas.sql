-- Metas individuais (por GC) e da equipe, por mês/ano.
-- gc_id = '00000000-0000-0000-0000-000000000000' representa a meta da equipe inteira
-- (não referencia gcs.id de propósito, para simplificar o upsert com uma única
-- constraint de unicidade, sem precisar de índices parciais).
create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  gc_id uuid not null,
  mes int not null check (mes between 1 and 12),
  ano int not null check (ano between 2020 and 2100),
  valor_meta numeric(12,2) not null,
  criado_em timestamptz not null default now(),
  unique (gc_id, mes, ano)
);

alter table metas disable row level security;
