-- ==========================================================
-- Áreas/cargos da equipe + chat por solicitação
--
-- Contexto: as solicitações eram roteadas por um "tipo de apoio" genérico
-- (Financeiro/Divulgação/Material/Espaço/Pessoas) com e-mail de destino
-- digitado à mão, sem nenhum vínculo com quem de fato gerencia aquilo. Agora
-- cada GC tem um cargo (ver AREAS/CARGOS em src/lib/types.ts) e a solicitação
-- é destinada a uma área — o(s) gestor(es) daquela área são resolvidos
-- automaticamente pra notificação e controle. Cada solicitação também ganha
-- uma conversa (chat) entre todos os envolvidos.
-- ==========================================================

alter table gcs add column if not exists cargo text;

alter table solicitacoes add column if not exists area text;

create table if not exists solicitacao_mensagens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  autor_gc_id uuid references gcs(id) on delete set null,
  mensagem text not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_solicitacao_mensagens_solicitacao on solicitacao_mensagens(solicitacao_id);

alter table solicitacao_mensagens enable row level security;

drop policy if exists "equipe autenticada" on solicitacao_mensagens;
create policy "equipe autenticada" on solicitacao_mensagens
  for all to authenticated
  using (public.gc_atual() is not null)
  with check (public.gc_atual() is not null);
