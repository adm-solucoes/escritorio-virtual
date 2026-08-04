-- Fecha as lacunas do Kanban nativo em relação ao Trello: anexos, histórico
-- de atividade e data de início. (Reordenar dentro da lista e busca não
-- precisaram de banco — a coluna `posicao` decimal já dava conta.)

-- ------------------------------------------------------------ data início --
-- O Trello tem início E prazo; a gente só tinha prazo. Nullable porque a
-- maioria dos cartões usa só o prazo.
alter table public.kanban_cartoes
  add column if not exists data_inicio timestamptz;

-- ---------------------------------------------------------------- anexos ---
-- O arquivo em si vai pro Supabase Storage (bucket `anexos`, o mesmo que o
-- CRM já usa); aqui fica só o ponteiro + metadado pra listar sem baixar.
create table if not exists public.kanban_anexos (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  nome text not null,
  url text not null,
  -- Caminho dentro do bucket: guardado à parte da URL pública porque é ele
  -- que a exclusão precisa pra apagar o arquivo de verdade do Storage.
  caminho text,
  tamanho_bytes bigint,
  tipo text,
  enviado_por uuid references public.gcs(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_anexos_cartao on public.kanban_anexos(cartao_id, criado_em desc);

-- -------------------------------------------------------------- histórico --
-- Equivalente ao feed de atividade do cartão no Trello: quem fez o quê.
-- `descricao` guarda a frase já pronta ("moveu de A para B") em vez de um
-- diff genérico — é o que o time lê, e evita ter que reconstruir o texto na
-- tela a cada tipo de evento novo.
create table if not exists public.kanban_atividades (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.kanban_cartoes(id) on delete cascade,
  gc_id uuid references public.gcs(id) on delete set null,
  tipo text not null,
  descricao text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kanban_atividades_cartao on public.kanban_atividades(cartao_id, criado_em desc);

-- -------------------------------------------------------------------- RLS --
-- Mesmo modelo das demais tabelas do Kanban (migration 042): quem tem sessão
-- real usa; anônimo não enxerga nada.
do $$
declare t text;
begin
  foreach t in array array['kanban_anexos','kanban_atividades'] loop
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
