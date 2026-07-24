-- Automações (Fase 2 — média prioridade)

-- Tarefa automática sugerida ao entrar em cada etapa do funil
alter table etapas_funil add column if not exists tarefa_padrao text;

update etapas_funil set tarefa_padrao = 'Fazer o briefing inicial com o cliente' where nome = 'Briefing';
update etapas_funil set tarefa_padrao = 'Montar o planejamento/escopo do projeto' where nome = 'Planejamento';
update etapas_funil set tarefa_padrao = 'Validar escopo e expectativas com o cliente' where nome = 'Validação';
update etapas_funil set tarefa_padrao = 'Enviar proposta comercial' where nome = 'Proposta';
update etapas_funil set tarefa_padrao = 'Agendar reunião de negociação' where nome = 'Negociação';
update etapas_funil set tarefa_padrao = 'Enviar contrato para assinatura' where nome = 'Contrato Fechado';
update etapas_funil set tarefa_padrao = 'Iniciar onboarding do cliente' where nome = 'Onboarding';

-- Notificação semanal de atividades atrasadas
alter table configuracoes_relatorio add column if not exists notificar_atividades_atrasadas boolean not null default true;
