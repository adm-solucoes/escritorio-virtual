-- Fase O — IA dentro do motor de automações: conteúdo gerado (WhatsApp/e-mail),
-- condição em linguagem natural e resumo interno com próxima ação sugerida.
--
-- Mensagens de IA voltadas ao cliente (WhatsApp/e-mail) por padrão NÃO saem
-- direto — ficam como "sugestão" pendente de revisão de um GC (a menos que o
-- nó tenha "enviarAutomatico" marcado). O resumo interno (acao_resumir_ia)
-- nunca fala com o cliente, então não precisa de revisão.

create table if not exists automacao_sugestoes_ia (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid references automacoes(id) on delete cascade,
  no_id uuid references automacao_nos(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  oportunidade_id uuid references oportunidades(id) on delete set null,
  canal text not null check (canal in ('whatsapp', 'email')),
  assunto text,
  conteudo text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'descartada')),
  criado_em timestamptz not null default now(),
  revisado_em timestamptz,
  revisado_por_gc_id uuid references gcs(id)
);

create index if not exists idx_automacao_sugestoes_ia_status on automacao_sugestoes_ia(status);

alter table automacao_sugestoes_ia enable row level security;
drop policy if exists "acesso liberado automacao sugestoes ia" on automacao_sugestoes_ia;
create policy "acesso liberado automacao sugestoes ia" on automacao_sugestoes_ia
  for all to public using (true) with check (true);

-- Permite a notificação in-app apontar pra uma sugestão de IA pendente de revisão.
alter table notificacoes drop constraint if exists notificacoes_link_tipo_check;
alter table notificacoes add constraint notificacoes_link_tipo_check
  check (link_tipo in ('empresa', 'oportunidade', 'atividade', 'sugestao_ia'));
