-- Um quadro por diretoria, com personalização e visibilidade controlada.
--
-- REGRAS ACORDADAS COM O TIME:
--   • Colaborador enxerga apenas o quadro da PRÓPRIA área.
--   • Gestor (qualquer um) enxerga TODOS os quadros — visibilidade cruzada de
--     gestão sem abrir tudo pra todo mundo.
--   • Só o gestor DA ÁREA personaliza o quadro dela (nome, cor, capa) e mexe
--     na estrutura de listas.
--
-- Até aqui a RLS do Kanban era "authenticated pode tudo". Agora ela precisa
-- ser de verdade, porque separar diretoria só na tela seria falso: bastaria
-- abrir o console do navegador pra ler o quadro de outra área.

-- ------------------------------------------------------------ novas colunas --
alter table public.kanban_quadros
  add column if not exists area text,
  add column if not exists cor_tema text not null default 'navy',
  add column if not exists imagem_capa text;

comment on column public.kanban_quadros.area is
  'Área da empresa dona do quadro (Marketing, Comercial, ...). NULL = quadro geral, visível a todos.';
comment on column public.kanban_quadros.cor_tema is
  'Cor do cabeçalho do quadro. Valor de uma lista fixa no app — não é CSS livre.';

-- --------------------------------------------------------- funções de apoio --
-- Área do GC logado, derivada do cargo. Fica no banco (e não só no app)
-- porque é a RLS que precisa dela pra decidir o que a pessoa enxerga.
create or replace function public.area_do_gc_atual()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when g.cargo ilike '%marketing%'            then 'Marketing'
    when g.cargo ilike '%gente%'                then 'Gente e Gestão (GG)'
    when g.cargo ilike '%comercial%'            then 'Comercial'
    when g.cargo ilike '%projeto%'              then 'Projetos'
    when g.cargo ilike '%presidente%'           then 'Presidência'
    else null
  end
  from public.gcs g
  where g.id = public.gc_atual()
  limit 1;
$fn$;

-- Gestor = cargo que começa com "Gestor" ou é Presidente. Mesma definição que
-- o app usa em nivelAcessoDoCargo(); duplicada aqui porque a RLS não pode
-- depender de código TypeScript.
create or replace function public.gc_atual_e_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select g.cargo ilike 'gestor%' or g.cargo ilike '%presidente%'
     from public.gcs g where g.id = public.gc_atual() limit 1),
    false
  );
$fn$;

-- Pode VER o quadro? Gestor vê todos; os demais, só o da própria área (e os
-- quadros gerais, sem área definida).
create or replace function public.pode_ver_quadro(p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.kanban_quadros q
    where q.id = p_quadro
      and (
        public.gc_atual_e_gestor()
        or q.area is null
        or q.area = public.area_do_gc_atual()
      )
  );
$fn$;

-- Pode ADMINISTRAR o quadro (renomear, trocar tema/capa, criar e arquivar
-- lista)? Só o gestor da área dele — ou qualquer gestor, se o quadro é geral.
create or replace function public.pode_administrar_quadro(p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.kanban_quadros q
    where q.id = p_quadro
      and public.gc_atual_e_gestor()
      and (q.area is null or q.area = public.area_do_gc_atual())
  );
$fn$;

revoke all on function public.area_do_gc_atual() from public;
revoke all on function public.gc_atual_e_gestor() from public;
revoke all on function public.pode_ver_quadro(uuid) from public;
revoke all on function public.pode_administrar_quadro(uuid) from public;
grant execute on function public.area_do_gc_atual() to authenticated;
grant execute on function public.gc_atual_e_gestor() to authenticated;
grant execute on function public.pode_ver_quadro(uuid) to authenticated;
grant execute on function public.pode_administrar_quadro(uuid) to authenticated;

-- ---------------------------------------------------------------- políticas --
-- QUADROS: ler conforme a regra; alterar só quem administra. Criar quadro é
-- privilégio de gestor.
drop policy if exists kanban_quadros_auth on public.kanban_quadros;
drop policy if exists kanban_quadros_ver on public.kanban_quadros;
drop policy if exists kanban_quadros_criar on public.kanban_quadros;
drop policy if exists kanban_quadros_alterar on public.kanban_quadros;

create policy kanban_quadros_ver on public.kanban_quadros
  for select to authenticated
  using (public.gc_atual_e_gestor() or area is null or area = public.area_do_gc_atual());

create policy kanban_quadros_criar on public.kanban_quadros
  for insert to authenticated
  with check (public.gc_atual_e_gestor());

create policy kanban_quadros_alterar on public.kanban_quadros
  for update to authenticated
  using (public.pode_administrar_quadro(id))
  with check (public.pode_administrar_quadro(id));

-- LISTAS: quem vê o quadro, vê as listas. Mexer na estrutura é só de quem
-- administra — é isso que impede um colaborador de arquivar a coluna do time.
drop policy if exists kanban_listas_auth on public.kanban_listas;
drop policy if exists kanban_listas_ver on public.kanban_listas;
drop policy if exists kanban_listas_mexer on public.kanban_listas;

create policy kanban_listas_ver on public.kanban_listas
  for select to authenticated using (public.pode_ver_quadro(quadro_id));

create policy kanban_listas_mexer on public.kanban_listas
  for all to authenticated
  using (public.pode_administrar_quadro(quadro_id))
  with check (public.pode_administrar_quadro(quadro_id));

-- ETIQUETAS: mesma lógica das listas.
drop policy if exists kanban_etiquetas_auth on public.kanban_etiquetas;
drop policy if exists kanban_etiquetas_ver on public.kanban_etiquetas;
drop policy if exists kanban_etiquetas_mexer on public.kanban_etiquetas;

create policy kanban_etiquetas_ver on public.kanban_etiquetas
  for select to authenticated using (public.pode_ver_quadro(quadro_id));

create policy kanban_etiquetas_mexer on public.kanban_etiquetas
  for all to authenticated
  using (public.pode_administrar_quadro(quadro_id))
  with check (public.pode_administrar_quadro(quadro_id));

-- CARTÕES: quem enxerga o quadro pode criar, mover e editar cartão — esse é o
-- trabalho do dia a dia, não é privilégio de gestor.
drop policy if exists kanban_cartoes_auth on public.kanban_cartoes;
drop policy if exists kanban_cartoes_tudo on public.kanban_cartoes;

create policy kanban_cartoes_tudo on public.kanban_cartoes
  for all to authenticated
  using (exists (
    select 1 from public.kanban_listas l
    where l.id = kanban_cartoes.lista_id and public.pode_ver_quadro(l.quadro_id)
  ))
  with check (exists (
    select 1 from public.kanban_listas l
    where l.id = kanban_cartoes.lista_id and public.pode_ver_quadro(l.quadro_id)
  ));

-- FILHAS DO CARTÃO (etiquetas aplicadas, membros, checklists, itens,
-- comentários, anexos, atividades): herdam a permissão do cartão.
do $$
declare t text;
begin
  foreach t in array array[
    'kanban_cartao_etiquetas','kanban_cartao_membros','kanban_checklists',
    'kanban_comentarios','kanban_anexos','kanban_atividades'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_tudo', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (exists (
        select 1 from public.kanban_cartoes c
        join public.kanban_listas l on l.id = c.lista_id
        where c.id = %I.cartao_id and public.pode_ver_quadro(l.quadro_id)
      ))
      with check (exists (
        select 1 from public.kanban_cartoes c
        join public.kanban_listas l on l.id = c.lista_id
        where c.id = %I.cartao_id and public.pode_ver_quadro(l.quadro_id)
      ))
    $f$, t || '_tudo', t, t, t);
  end loop;
end $$;

-- Itens de checklist não têm cartao_id — chegam nele pelo checklist.
drop policy if exists kanban_checklist_itens_auth on public.kanban_checklist_itens;
drop policy if exists kanban_checklist_itens_tudo on public.kanban_checklist_itens;
create policy kanban_checklist_itens_tudo on public.kanban_checklist_itens
  for all to authenticated
  using (exists (
    select 1 from public.kanban_checklists ck
    join public.kanban_cartoes c on c.id = ck.cartao_id
    join public.kanban_listas l on l.id = c.lista_id
    where ck.id = kanban_checklist_itens.checklist_id and public.pode_ver_quadro(l.quadro_id)
  ))
  with check (exists (
    select 1 from public.kanban_checklists ck
    join public.kanban_cartoes c on c.id = ck.cartao_id
    join public.kanban_listas l on l.id = c.lista_id
    where ck.id = kanban_checklist_itens.checklist_id and public.pode_ver_quadro(l.quadro_id)
  ));

-- --------------------------------------------------- um quadro por diretoria --
-- O quadro que já existia vira o quadro do Marketing (é onde o time começou).
-- Os demais nascem aqui, cada um com as mesmas colunas e etiquetas.
do $$
declare
  v_quadro uuid;
  v_pos numeric;
  v_nome text;
  v_area text;
  v_cor text;
  v_existente uuid;
begin
  -- O primeiro quadro criado (sem área) passa a ser o de Marketing.
  select id into v_existente from public.kanban_quadros where area is null order by criado_em limit 1;
  if v_existente is not null then
    update public.kanban_quadros
       set area = 'Marketing', nome = 'Marketing', cor_tema = 'blue'
     where id = v_existente;
  end if;

  for v_area, v_nome, v_cor in
    select * from (values
      ('Presidência',        'Presidência',  'navy'),
      ('Gente e Gestão (GG)','Gente e Gestão','green'),
      ('Comercial',          'Comercial',    'red'),
      ('Projetos',           'Projetos',     'purple')
    ) as t(a, n, c)
  loop
    if exists (select 1 from public.kanban_quadros where area = v_area) then
      continue;
    end if;

    insert into public.kanban_quadros (nome, descricao, area, cor_tema)
    values (v_nome, 'Quadro da diretoria de ' || v_nome || '.', v_area, v_cor)
    returning id into v_quadro;

    v_pos := 1000;
    foreach v_nome in array array[
      '📥 Backlog / Ideias','📋 A Fazer','🔄 Em Progresso',
      '👀 Em Revisão / Aprovação','✅ Concluído','🗄️ Arquivado'
    ] loop
      insert into public.kanban_listas (quadro_id, nome, posicao) values (v_quadro, v_nome, v_pos);
      v_pos := v_pos + 1000;
    end loop;

    insert into public.kanban_etiquetas (quadro_id, nome, cor) values
      (v_quadro, 'Urgente', 'red'),
      (v_quadro, 'Bloqueado', 'black'),
      (v_quadro, 'Interno', 'purple'),
      (v_quadro, 'Cliente', 'sky');
  end loop;
end $$;
