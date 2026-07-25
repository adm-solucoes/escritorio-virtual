-- Integração WhatsApp Cloud API (institucional — todos os GCs veem/respondem
-- qualquer conversa, não é privado por vendedor)

create table if not exists whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete set null,
  telefone text not null unique, -- formato E.164, ex: 5585999998888
  ultima_mensagem_em timestamptz,
  status text not null default 'Aberta' check (status in ('Aberta', 'Arquivada')),
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references whatsapp_conversas(id) on delete cascade,
  direcao text not null check (direcao in ('enviada', 'recebida')),
  conteudo text not null,
  tipo text not null default 'texto' check (tipo in ('texto', 'template', 'midia')),
  enviado_por_gc_id uuid references gcs(id),
  whatsapp_message_id text,
  status_entrega text check (status_entrega in ('enviando', 'enviado', 'entregue', 'lido', 'falhou')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_whatsapp_mensagens_conversa on whatsapp_mensagens(conversa_id);
create index if not exists idx_whatsapp_conversas_empresa on whatsapp_conversas(empresa_id);

-- RLS ligado desde já com política permissiva. É institucional (qualquer GC
-- vê/responde qualquer conversa), e por enquanto segue o mesmo modelo do
-- resto do sistema (acesso liberado pela chave anônima, sem checar login no
-- banco — o login hoje só controla a navegação nas telas).
alter table whatsapp_conversas enable row level security;
alter table whatsapp_mensagens enable row level security;

drop policy if exists "acesso liberado conversas" on whatsapp_conversas;
create policy "acesso liberado conversas" on whatsapp_conversas
  for all to public using (true) with check (true);

drop policy if exists "acesso liberado mensagens" on whatsapp_mensagens;
create policy "acesso liberado mensagens" on whatsapp_mensagens
  for all to public using (true) with check (true);
