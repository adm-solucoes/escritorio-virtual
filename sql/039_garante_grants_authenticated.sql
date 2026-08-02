-- ==========================================================
-- Garante que a role `authenticated` tem o GRANT básico em toda tabela
-- do schema public.
--
-- Contexto: RLS (política de linha) e GRANT (permissão na tabela como um
-- todo) são coisas diferentes no Postgres. A migration 034 criou a política
-- "equipe autenticada" em todas as tabelas, mas só mexeu explicitamente nos
-- grants do papel `anon` (revogando tudo dele) — nunca confirmou que
-- `authenticated` de fato tem GRANT nas tabelas.
--
-- Sintoma observado: algumas tabelas (ex: empresas, ligacoes_agente_voz)
-- devolvem "permission denied for table X" pra um usuário autenticado de
-- verdade, em vez de simplesmente devolver 0 linhas (que é o que RLS faz
-- quando a política nega acesso). "Permission denied" é sinal de falta de
-- GRANT, não de RLS filtrando — são erros diferentes.
--
-- Esta migration é segura de rodar mesmo se os grants já existirem (GRANT
-- é idempotente) e não abre acesso nenhum a mais: RLS continua sendo quem
-- decide quais LINHAS cada GC enxerga, isso aqui só garante que a role
-- consegue "bater na porta" da tabela.
-- ==========================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Mesma garantia pra tabelas/sequências/funções criadas no futuro.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- ----------------------------------------------------------
-- Reaplica a restrição de coluna em integracoes_google
--
-- O "grant select ... on all tables" acima é mais amplo que o grant por
-- coluna que a 034 tinha feito ali (tokens do Google não podem ser lidos
-- pelo navegador) — grant de tabela sobrepõe grant de coluna. Sem isto, esta
-- migration reabriria access_token/refresh_token pra authenticated de novo.
-- Repete exatamente o que a 034 já fazia, só que depois do grant amplo.
-- ----------------------------------------------------------
revoke select on public.integracoes_google from authenticated;
grant select (id, gc_id, email_google, compartilhar_agenda, expira_em, criado_em, atualizado_em)
  on public.integracoes_google to authenticated;
grant update (compartilhar_agenda) on public.integracoes_google to authenticated;
