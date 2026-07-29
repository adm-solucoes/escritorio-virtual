-- Configuração editável dos agentes de IA reais que a ADM Soluções já usa
-- (assistente de chat do CRM e o agente de voz outbound "Fernanda"). Não é
-- um framework genérico de criar agentes do zero — só os 2 que existem.

create table if not exists agentes_ia (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,          -- "assistente-chat" | "agente-voz"
  nome text not null,
  instrucoes_extra text default '',    -- some ao prompt de sistema real do agente
  usar_emojis boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into agentes_ia (chave, nome, instrucoes_extra, usar_emojis)
values
  ('assistente-chat', 'Assistente comercial', '', true),
  ('agente-voz', 'Fernanda', '', false)
on conflict (chave) do nothing;
