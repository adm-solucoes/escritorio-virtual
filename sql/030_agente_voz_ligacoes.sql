-- Histórico de ligações do agente de voz outbound (projeto separado,
-- agente-voz-outbound/), recebido via webhook em /api/agente-voz/resultado.
-- Guardamos aqui em vez de só usar `atividades` porque queremos uma tela
-- dedicada (transcrição completa, duração, interesse) sem poluir a tabela
-- genérica de atividades.

create table if not exists ligacoes_agente_voz (
  id uuid primary key default gen_random_uuid(),
  call_id text not null unique,
  telefone text not null,
  empresa_id uuid references empresas(id) on delete set null,
  interessado boolean,
  motivo_recusa text,
  melhor_horario_retorno text,
  resumo text,
  transcricao_completa text,
  trigger_whatsapp_followup boolean not null default false,
  sugestao_whatsapp_id uuid references automacao_sugestoes_ia(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists ligacoes_agente_voz_empresa_id_idx on ligacoes_agente_voz(empresa_id);
create index if not exists ligacoes_agente_voz_criado_em_idx on ligacoes_agente_voz(criado_em desc);

alter table ligacoes_agente_voz enable row level security;

drop policy if exists "ligacoes_agente_voz leitura autenticada" on ligacoes_agente_voz;
create policy "ligacoes_agente_voz leitura autenticada" on ligacoes_agente_voz
  for select to authenticated using (true);

-- A rota /api/agente-voz/resultado insere usando a mesma chave anônima que o
-- resto do webhook já usa (igual `atividades`/`automacao_sugestoes_ia`) — só
-- quem tem o segredo do header x-api-key (AGENTE_VOZ_WEBHOOK_SECRET) chega
-- até esse insert, a policy de banco só libera o "caminho".
drop policy if exists "ligacoes_agente_voz insert publico" on ligacoes_agente_voz;
create policy "ligacoes_agente_voz insert publico" on ligacoes_agente_voz
  for insert to anon with check (true);
