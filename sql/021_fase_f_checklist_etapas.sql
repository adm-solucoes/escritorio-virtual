-- Fase F — Checklist configurável de onboarding/renovação. Migração aditiva.

create table if not exists checklist_etapa_config (
  id uuid primary key default gen_random_uuid(),
  etapa text not null references etapas_funil(nome),
  nome_item text not null,
  prazo_dias int not null default 1,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_checklist_etapa on checklist_etapa_config(etapa);

alter table checklist_etapa_config enable row level security;
drop policy if exists "acesso liberado checklist_etapa_config" on checklist_etapa_config;
create policy "acesso liberado checklist_etapa_config" on checklist_etapa_config for all to public using (true) with check (true);

insert into checklist_etapa_config (etapa, nome_item, prazo_dias, ordem) values
  ('Onboarding', 'Enviar formulário de boas-vindas', 1, 1),
  ('Onboarding', 'Agendar reunião de kickoff', 3, 2),
  ('Renovação', 'Confirmar interesse em renovar', 5, 1),
  ('Renovação', 'Enviar proposta de renovação', 10, 2);
