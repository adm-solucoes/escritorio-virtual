-- Integração Instagram Direct (Instagram Messaging API) — institucional, mesmo
-- modelo do WhatsApp: qualquer GC vê/responde qualquer conversa.
--
-- Diferenças importantes em relação ao WhatsApp que moldam este schema:
-- 1) Não existe "template" no Instagram — só dá pra responder dentro da janela
--    de 24h da última mensagem do cliente. Fora disso, não tem como reabrir.
-- 2) Não dá pra iniciar uma conversa (a empresa não pode escrever primeiro),
--    então a conversa só nasce quando chega uma mensagem via webhook — o
--    vínculo com uma empresa é feito por username (automático) ou manual.
-- 3) A identidade do contato é o instagram_scoped_id (IGSID), não um telefone.

create table if not exists instagram_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete set null,
  instagram_scoped_id text not null unique, -- IGSID do contato
  username text,
  nome_perfil text,
  ultima_mensagem_em timestamptz,
  status text not null default 'Aberta' check (status in ('Aberta', 'Arquivada')),
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists instagram_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references instagram_conversas(id) on delete cascade,
  direcao text not null check (direcao in ('enviada', 'recebida')),
  conteudo text not null,
  tipo text not null default 'texto' check (tipo in ('texto', 'imagem', 'video', 'audio', 'midia', 'nota')),
  interna boolean not null default false,
  midia_url text,
  midia_nome text,
  enviado_por_gc_id uuid references gcs(id),
  instagram_message_id text,
  status_entrega text check (status_entrega in ('enviando', 'enviado', 'lido', 'falhou')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_instagram_mensagens_conversa on instagram_mensagens(conversa_id);
create index if not exists idx_instagram_conversas_empresa on instagram_conversas(empresa_id);

alter table instagram_conversas enable row level security;
alter table instagram_mensagens enable row level security;

drop policy if exists "acesso liberado instagram conversas" on instagram_conversas;
create policy "acesso liberado instagram conversas" on instagram_conversas
  for all to public using (true) with check (true);

drop policy if exists "acesso liberado instagram mensagens" on instagram_mensagens;
create policy "acesso liberado instagram mensagens" on instagram_mensagens
  for all to public using (true) with check (true);

-- Usuário do Instagram cadastrado na empresa (@handle, sem o @) — usado pra
-- casar automaticamente uma conversa recebida com a empresa correspondente,
-- do mesmo jeito que o telefone já faz pro WhatsApp.
alter table empresas add column if not exists instagram_usuario text;

-- Bucket público para as mídias enviadas/recebidas nas conversas do Instagram.
insert into storage.buckets (id, name, public)
values ('instagram-media', 'instagram-media', true)
on conflict (id) do nothing;

drop policy if exists "instagram media leitura publica" on storage.objects;
create policy "instagram media leitura publica" on storage.objects
  for select to public using (bucket_id = 'instagram-media');

drop policy if exists "instagram media upload publico" on storage.objects;
create policy "instagram media upload publico" on storage.objects
  for insert to public with check (bucket_id = 'instagram-media');
