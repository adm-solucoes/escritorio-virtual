-- Cada GC decide se quer compartilhar a própria agenda do Google Calendar com o time,
-- pra todo mundo ver os compromissos de todos e não bater horário.
alter table integracoes_google add column if not exists compartilhar_agenda boolean not null default false;
