-- Kanban nativo do CRM — substitui o Trello, pra o time usar uma ferramenta só.
--
-- Decisões de modelagem que valem explicar:
--
-- 1. `posicao` é NUMERIC, não INTEGER. Isso é o que permite arrastar um cartão
--    pro meio da lista escrevendo UMA linha: a posição nova é a média entre o
--    vizinho de cima e o de baixo (ex: entre 1000 e 2000 → 1500). Com inteiro
--    seria preciso reescrever a posição de todos os cartões abaixo a cada
--    arrasto — mais escrita, mais chance de conflito entre duas pessoas
--    mexendo no quadro ao mesmo tempo.
--
-- 2. Arquivar em vez de apagar (`arquivado boolean`). É como o Trello se
--    comporta e evita perder histórico por clique errado.
--
-- 3. Etiqueta pertence ao QUADRO (não é global), igual ao Trello: cada quadro
--    define as suas.

-- ---------------------------------------------------------------- quadros --
create table if not exists public.kanban_quadros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  criado_por uuid references public.gcs(id) on delete set null,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- listas ---
create table if not exists public.kanban_listas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  nome text not null,
  posicao numeric not null default 1000,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_listas_quadro on public.kanban_listas(quadro_id, posicao);

-- --------------------------------------------------------------- cartões ---
create table if not exists public.kanban_cartoes (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.kanban_listas(id) on delete cascade,
  titulo text not null,
  descricao text,
  posicao numeric not null default 1000,
  prazo timestamptz,
  prazo_concluido boolean not null default false,
  arquivado boolean not null default false,
  criado_por uuid references public.gcs(id) on delete set null,
  -- Origem opcional: cartão que nasceu de uma solicitação do CRM.
  solicitacao_id uuid references public.solicitacoes(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_kanban_cartoes_lista on public.kanban_cartoes(lista_id, posicao);

-- ------------------------------------------------------------- etiquetas ---
create table if not exists public.kanban_etiquetas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  nome text not null,
  cor text not null default 'blue',
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_etiquetas_quadro on public.kanban_etiquetas(quadro_id);

create table if not exists public.kanban_cartao_etiquetas (
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  etiqueta_id uuid not null references public.kanban_etiquetas(id) on delete cascade,
  primary key (cartao_id, etiqueta_id)
);

-- --------------------------------------------------------------- membros ---
create table if not exists public.kanban_cartao_membros (
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  gc_id uuid not null references public.gcs(id) on delete cascade,
  primary key (cartao_id, gc_id)
);

-- ------------------------------------------------------------ checklists ---
create table if not exists public.kanban_checklists (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  titulo text not null default 'Checklist',
  posicao numeric not null default 1000,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_checklists_cartao on public.kanban_checklists(cartao_id, posicao);

create table if not exists public.kanban_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.kanban_checklists(id) on delete cascade,
  texto text not null,
  concluido boolean not null default false,
  posicao numeric not null default 1000,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_checklist_itens on public.kanban_checklist_itens(checklist_id, posicao);

-- ----------------------------------------------------------- comentários ---
create table if not exists public.kanban_comentarios (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  gc_id uuid references public.gcs(id) on delete set null,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_comentarios_cartao on public.kanban_comentarios(cartao_id, criado_em);

-- -------------------------------------------------------------------- RLS --
-- Mesmo modelo do resto do CRM: quem tem sessão real (authenticated) usa;
-- anônimo não enxerga nada. O controle fino de quem vê o quê já é feito pelo
-- app — aqui a trava é "precisa estar logado".
do $$
declare t text;
begin
  foreach t in array array[
    'kanban_quadros','kanban_listas','kanban_cartoes','kanban_etiquetas',
    'kanban_cartao_etiquetas','kanban_cartao_membros','kanban_checklists',
    'kanban_checklist_itens','kanban_comentarios'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_auth', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ------------------------------------------------- quadro inicial do time --
-- Cria o quadro padrão só se ainda não existir nenhum, com as mesmas colunas
-- e etiquetas que o time já usava no Trello — pra ninguém precisar montar do
-- zero no primeiro acesso.
do $$
declare
  v_quadro uuid;
  v_pos numeric := 1000;
  v_nome text;
begin
  if exists (select 1 from public.kanban_quadros) then return; end if;

  insert into public.kanban_quadros (nome, descricao)
  values ('Kanban — Marketing · Gente · Gestão', 'Quadro compartilhado entre Marketing, Gente e Gestão.')
  returning id into v_quadro;

  foreach v_nome in array array[
    '📥 Backlog / Ideias','📋 A Fazer','🔄 Em Progresso',
    '👀 Em Revisão / Aprovação','✅ Concluído','🗄️ Arquivado'
  ] loop
    insert into public.kanban_listas (quadro_id, nome, posicao) values (v_quadro, v_nome, v_pos);
    v_pos := v_pos + 1000;
  end loop;

  insert into public.kanban_etiquetas (quadro_id, nome, cor) values
    (v_quadro, 'Marketing', 'blue'),
    (v_quadro, 'Gente', 'green'),
    (v_quadro, 'Gestão', 'yellow'),
    (v_quadro, 'Urgente', 'red'),
    (v_quadro, 'Bloqueado', 'black');
end $$;
