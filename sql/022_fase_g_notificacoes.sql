-- Fase G — Central de notificações in-app. Migração aditiva.

create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  gc_id uuid references gcs(id) on delete cascade,
  tipo text not null,
  mensagem text not null,
  link_tipo text check (link_tipo in ('empresa', 'oportunidade', 'atividade')),
  link_id uuid,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_notificacoes_gc on notificacoes(gc_id, lida);

alter table notificacoes enable row level security;
drop policy if exists "acesso liberado notificacoes" on notificacoes;
create policy "acesso liberado notificacoes" on notificacoes for all to public using (true) with check (true);
