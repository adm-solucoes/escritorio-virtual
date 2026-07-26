-- Fase 3 da auditoria RevOps — nutrição automática, alerta de renovação e captura pública de leads.
-- Migração aditiva, nenhuma tabela/coluna existente é removida. Rode tudo de uma vez.

-- ==========================================================
-- 14) Sequências de nutrição pausáveis por oportunidade
-- (reaproveita o motor de Automações já existente — só adiciona um nó de e-mail
-- e a possibilidade de pausar automações numa oportunidade específica)
-- ==========================================================
alter table oportunidades add column if not exists pausar_automacoes boolean not null default false;

-- ==========================================================
-- 15) Alerta automático de renovação
-- ==========================================================
alter table oportunidades add column if not exists data_renovacao date;

-- Novos tipos de nó no motor de Automações: e-mail de follow-up, gatilho de renovação
-- próxima e o alerta dedicado de renovação (notifica o GC por e-mail + interno).
alter table automacao_nos drop constraint if exists automacao_nos_tipo_check;
alter table automacao_nos add constraint automacao_nos_tipo_check check (tipo in (
  'gatilho_etapa', 'gatilho_atividade_atrasada', 'gatilho_sem_contato', 'gatilho_data_hora', 'gatilho_renovacao_proxima',
  'condicao',
  'acao_whatsapp', 'acao_agendar_reuniao', 'acao_criar_atividade', 'acao_notificar_interno', 'acao_email', 'acao_alertar_renovacao',
  'espera'
));

-- ==========================================================
-- 16) Endpoint público de captura de leads
-- ==========================================================
create table if not exists formularios_captura (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_api text not null unique default encode(gen_random_bytes(16), 'hex'),
  origem_lead text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table formularios_captura enable row level security;
drop policy if exists "acesso liberado formularios_captura" on formularios_captura;
create policy "acesso liberado formularios_captura" on formularios_captura for all to public using (true) with check (true);
