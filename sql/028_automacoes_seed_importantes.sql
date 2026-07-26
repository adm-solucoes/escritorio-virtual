-- Fase O (complemento): automações prontas cobrindo pontos importantes do funil
-- comercial e pós-venda. Todas nascem como 'rascunho' — não disparam nada até
-- alguém revisar a configuração (templates de WhatsApp, textos, etc.) e ativar
-- manualmente na tela de Automações.

-- ==========================================================
-- 1) Risco de cancelamento (IA) — pós-venda
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Risco de cancelamento (IA)',
    'Oportunidade pós-venda sem contato há 10 dias: a IA lê o histórico e avalia se há sinal de insatisfação antes de acionar o GC.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_sem_contato', 100, 40, '{"dias": 10}'::jsonb from automacao
  returning id
),
n_condicao as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'condicao', 100, 200,
    '{"campo": "ia", "perguntaIA": "Existem sinais de insatisfação, reclamação ou risco de cancelamento nas últimas mensagens ou nas observações dessa conta?"}'::jsonb
  from automacao
  returning id
),
n_notificar as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_notificar_interno', -60, 360,
    '{"mensagem": "A IA identificou possível risco de cancelamento nesta conta — revise com atenção"}'::jsonb
  from automacao
  returning id
),
n_resumo as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_resumir_ia', 220, 360, '{}'::jsonb from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_condicao.id, null from automacao, n_gatilho, n_condicao
union all
select automacao.id, n_condicao.id, n_notificar.id, 'sim' from automacao, n_condicao, n_notificar
union all
select automacao.id, n_condicao.id, n_resumo.id, 'sim' from automacao, n_condicao, n_resumo;

-- ==========================================================
-- 2) Reativar lead frio (IA) — comercial
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Reativar lead frio (IA)',
    'Oportunidade sem contato há 21 dias: a IA avalia se ainda parece haver interesse antes de tentar reengajar por WhatsApp.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_sem_contato', 100, 40, '{"dias": 21}'::jsonb from automacao
  returning id
),
n_condicao as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'condicao', 100, 200,
    '{"campo": "ia", "perguntaIA": "Baseado no histórico de mensagens e nas observações da oportunidade, essa empresa ainda parece ter interesse real, mesmo sem contato recente?"}'::jsonb
  from automacao
  returning id
),
n_whatsapp as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_whatsapp', 260, 360,
    '{"modo": "ia", "instrucaoIA": "Mensagem cordial de reengajamento perguntando se ainda há interesse no projeto/proposta, sem soar comercial demais, se colocando à disposição pra tirar dúvidas", "enviarAutomatico": false}'::jsonb
  from automacao
  returning id
),
n_notificar as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_notificar_interno', -80, 360,
    '{"mensagem": "Lead parado há mais de 21 dias e a IA avalia baixa chance de reengajamento — considere reclassificar ou arquivar"}'::jsonb
  from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_condicao.id, null from automacao, n_gatilho, n_condicao
union all
select automacao.id, n_condicao.id, n_whatsapp.id, 'sim' from automacao, n_condicao, n_whatsapp
union all
select automacao.id, n_condicao.id, n_notificar.id, 'nao' from automacao, n_condicao, n_notificar;

-- ==========================================================
-- 3) Follow-up de proposta parada (IA) — comercial
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Follow-up de proposta parada (IA)',
    'Oportunidade entra em Proposta e, 3 dias depois, recebe um follow-up gerado por IA perguntando se já deu tempo de analisar.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_etapa', 100, 40, '{"etapa": "Proposta"}'::jsonb from automacao
  returning id
),
n_espera as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'espera', 100, 200, '{"quantidade": 3, "unidade": "dias"}'::jsonb from automacao
  returning id
),
n_whatsapp as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_whatsapp', 100, 360,
    '{"modo": "ia", "instrucaoIA": "Follow-up cordial perguntando se já teve tempo de analisar a proposta enviada, oferecendo tirar dúvidas ou ajustar algum ponto", "enviarAutomatico": false}'::jsonb
  from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_espera.id, null from automacao, n_gatilho, n_espera
union all
select automacao.id, n_espera.id, n_whatsapp.id, null from automacao, n_espera, n_whatsapp;

-- ==========================================================
-- 4) Boas-vindas ao Onboarding — pós-venda
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Boas-vindas ao Onboarding',
    'Assim que a oportunidade entra em Onboarding, manda e-mail de boas-vindas e já cria a atividade de kickoff pro GC.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_etapa', 100, 40, '{"etapa": "Onboarding"}'::jsonb from automacao
  returning id
),
n_email as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_email', -60, 220,
    ('{"modo": "fixo", "assunto": "Bem-vindo(a) à ADM Soluções, {empresa}!", "corpoHtml": ' ||
     '"<p>Olá! É um prazer ter a <strong>{empresa}</strong> como cliente da ADM Soluções.</p><p>Nos próximos dias, nosso time vai entrar em contato para dar início ao onboarding. Qualquer dúvida, estamos à disposição.</p>"' ||
     '}')::jsonb
  from automacao
  returning id
),
n_atividade as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_criar_atividade', 240, 220,
    '{"tipoAtividade": "Ligação de kickoff do onboarding", "prazoDias": 1}'::jsonb
  from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_email.id, null from automacao, n_gatilho, n_email
union all
select automacao.id, n_gatilho.id, n_atividade.id, null from automacao, n_gatilho, n_atividade;

-- ==========================================================
-- 5) Renovação — resumo e alerta antecipado — CS
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Renovação — resumo e alerta antecipado',
    '30 dias antes da renovação, a IA resume a saúde da conta e sugere a próxima ação antes de alertar o GC responsável.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_renovacao_proxima', 100, 40, '{"diasAntes": 30}'::jsonb from automacao
  returning id
),
n_resumo as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_resumir_ia', 100, 200, '{}'::jsonb from automacao
  returning id
),
n_alerta as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_alertar_renovacao', 100, 360, '{}'::jsonb from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_resumo.id, null from automacao, n_gatilho, n_resumo
union all
select automacao.id, n_resumo.id, n_alerta.id, null from automacao, n_resumo, n_alerta;

-- ==========================================================
-- 6) Atividade atrasada — aviso imediato
-- ==========================================================
with automacao as (
  insert into automacoes (nome, descricao, status)
  values (
    'Atividade atrasada — aviso imediato',
    'Qualquer atividade que passar do prazo gera notificação in-app imediata pro responsável.',
    'rascunho'
  )
  returning id
),
n_gatilho as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'gatilho_atividade_atrasada', 100, 40, '{}'::jsonb from automacao
  returning id
),
n_notificar as (
  insert into automacao_nos (automacao_id, tipo, posicao_x, posicao_y, config)
  select automacao.id, 'acao_notificar_interno', 100, 200,
    '{"mensagem": "Atividade atrasada — revise o prazo ou marque como concluída"}'::jsonb
  from automacao
  returning id
)
insert into automacao_conexoes (automacao_id, no_origem_id, no_destino_id, condicao)
select automacao.id, n_gatilho.id, n_notificar.id, null from automacao, n_gatilho, n_notificar;
