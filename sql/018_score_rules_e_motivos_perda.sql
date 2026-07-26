-- Fase 1 da auditoria RevOps: pesos do Score de lead e motivos de perda deixam de ser
-- hardcoded no código e passam a ser configuráveis em Configurações. Migração aditiva —
-- os valores seedados abaixo reproduzem exatamente o comportamento atual, nada muda
-- até alguém editar pela tela.

create table if not exists score_rules (
  chave text primary key,
  label text not null,
  peso int not null,
  ativo boolean not null default true
);

insert into score_rules (chave, label, peso) values
  ('icp_a', 'ICP A', 40),
  ('icp_b', 'ICP B', 25),
  ('icp_c', 'ICP C', 10),
  ('temperatura_quente', 'Temperatura Quente', 30),
  ('temperatura_morno', 'Temperatura Morna', 15),
  ('temperatura_frio', 'Temperatura Fria', 5),
  ('oportunidade_com_valor', 'Oportunidade em aberto com valor', 20),
  ('oportunidade_sem_valor', 'Oportunidade em aberto sem valor', 10),
  ('interacao_recente', 'Interação nos últimos 7 dias', 10)
on conflict (chave) do nothing;

create table if not exists motivos_perda_config (
  id uuid primary key default gen_random_uuid(),
  motivo text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0
);

insert into motivos_perda_config (motivo, ordem) values
  ('Preço', 1),
  ('Concorrência', 2),
  ('Sem orçamento', 3),
  ('Não é decisor', 4),
  ('Timing / não é o momento', 5),
  ('Perdeu contato', 6)
on conflict (motivo) do nothing;

alter table score_rules enable row level security;
alter table motivos_perda_config enable row level security;

drop policy if exists "acesso liberado score_rules" on score_rules;
create policy "acesso liberado score_rules" on score_rules for all to public using (true) with check (true);

drop policy if exists "acesso liberado motivos_perda_config" on motivos_perda_config;
create policy "acesso liberado motivos_perda_config" on motivos_perda_config for all to public using (true) with check (true);
