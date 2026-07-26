-- Corrige um esquecimento da migration 026: a trava de tipos válidos de nó
-- (automacao_nos_tipo_check) nunca foi atualizada com "acao_resumir_ia" — sem
-- isso, esse nó específico não conseguia ser salvo no banco.

alter table automacao_nos drop constraint if exists automacao_nos_tipo_check;
alter table automacao_nos add constraint automacao_nos_tipo_check check (tipo in (
  'gatilho_etapa', 'gatilho_atividade_atrasada', 'gatilho_sem_contato', 'gatilho_data_hora', 'gatilho_renovacao_proxima',
  'condicao',
  'acao_whatsapp', 'acao_agendar_reuniao', 'acao_criar_atividade', 'acao_notificar_interno', 'acao_email', 'acao_alertar_renovacao', 'acao_resumir_ia',
  'espera'
));
