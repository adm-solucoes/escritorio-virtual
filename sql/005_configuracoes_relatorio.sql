-- Configuração editável do envio de relatórios por e-mail
create table if not exists configuracoes_relatorio (
  id int primary key default 1,
  email_destino text,
  envio_automatico boolean not null default true,
  atualizado_em timestamptz not null default now(),
  constraint apenas_uma_linha check (id = 1)
);

insert into configuracoes_relatorio (id, email_destino, envio_automatico)
values (1, 'caio.gadelha@admsolucoes.com.br', true)
on conflict (id) do nothing;

alter table configuracoes_relatorio disable row level security;
