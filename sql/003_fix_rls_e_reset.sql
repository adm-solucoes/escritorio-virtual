-- Corrige acesso (desativa RLS por enquanto — ainda não temos login/autenticação,
-- isso entra na Fase 3) e limpa qualquer dado duplicado de tentativas anteriores.

alter table gcs disable row level security;
alter table empresas disable row level security;
alter table oportunidades disable row level security;
alter table atividades disable row level security;
alter table etapas_funil disable row level security;

truncate table atividades, oportunidades, empresas, gcs restart identity cascade;
