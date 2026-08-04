-- Liga uma solicitação do CRM ao cartão correspondente no Trello.
--
-- Guardar o id/url aqui é o que torna o botão "Mandar pro Kanban" idempotente:
-- sem isso, cada clique criaria um cartão novo no Backlog. Com a coluna
-- preenchida, o botão vira um link pro cartão que já existe.

alter table public.solicitacoes
  add column if not exists trello_card_id text,
  add column if not exists trello_card_url text;

comment on column public.solicitacoes.trello_card_id is
  'ID do cartão no Trello criado a partir desta solicitação. Nulo = ainda não foi enviada pro quadro.';
comment on column public.solicitacoes.trello_card_url is
  'URL do cartão no Trello, para abrir direto do CRM.';
