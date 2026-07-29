-- Rastreamento de custo/uso de IA — cada chamada via chamarClaude() (src/lib/ai.ts)
-- grava uma linha aqui, automaticamente, pra dar visibilidade de quanto o CRM
-- está gastando em IA (chat do assistente, relatórios, automações, etc).

create table if not exists ia_uso (
  id uuid primary key default gen_random_uuid(),
  tarefa text not null,               -- "extrair" | "redigir"
  origem text,                        -- de onde veio a chamada (ex: "assistente-chat", "relatorio")
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_usd numeric(10, 6) not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists ia_uso_criado_em_idx on ia_uso (criado_em);
