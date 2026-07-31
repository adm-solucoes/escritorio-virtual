-- ==========================================================
-- CORREÇÃO CRÍTICA DE SEGURANÇA
--
-- Situação antes desta migration: TODAS as 35 tabelas estavam legíveis E
-- graváveis por qualquer pessoa da internet, sem login nenhum. Duas causas
-- somadas:
--
--   1. sql/003 desligou o RLS de gcs/empresas/oportunidades/atividades/
--      etapas_funil com a justificativa "ainda não temos login, isso entra
--      na Fase 3". O login entrou, mas o RLS nunca foi religado.
--   2. As demais tabelas tinham RLS ligado, porém com política
--      `for all to public using (true)` — que na prática libera tudo.
--
-- A chave anônima (NEXT_PUBLIC_SUPABASE_ANON_KEY) é pública por natureza:
-- vai embutida no JS do site, qualquer visitante lê ela no navegador. Sem
-- RLS de verdade, ela virava acesso total ao banco — incluindo a tabela
-- integracoes_google, que guarda refresh_token do Google da equipe.
--
-- Verificado na prática (leitura de clientes reais + INSERT anônimo) antes
-- de escrever esta correção.
--
-- O que esta migration faz:
--   - liga RLS em todas as tabelas do schema public;
--   - troca as políticas `to public` por `to authenticated` + confirmação
--     de que o usuário é mesmo um GC ativo (função gc_atual);
--   - tira todo e qualquer acesso do papel `anon`;
--   - trata integracoes_google à parte: só o dono enxerga a própria linha,
--     e as colunas de token não são legíveis nem por ele (só pelo servidor,
--     que usa a chave de serviço).
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Quem é o GC logado?
--
-- security definer: a função precisa ler `gcs` ignorando o RLS da própria
-- `gcs`, senão vira recursão infinita (a política de gcs chamaria gc_atual,
-- que leria gcs, que chamaria a política...).
-- Devolve NULL se: não tem sessão, o e-mail não está cadastrado como GC, ou
-- o GC está marcado como sem_acesso.
-- ----------------------------------------------------------
create or replace function public.gc_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select id
  from public.gcs
  where lower(email) = lower(auth.jwt() ->> 'email')
    and coalesce(role, 'comercial') <> 'sem_acesso'
  limit 1;
$fn$;

revoke all on function public.gc_atual() from public;
grant execute on function public.gc_atual() to authenticated;

-- ----------------------------------------------------------
-- 2. Liga RLS em tudo e substitui as políticas abertas
--
-- Percorre o schema inteiro (em vez de listar tabela por tabela) pra não
-- deixar de fora nada que tenha sido criado depois — inclusive tabelas
-- futuras que alguém esqueça de proteger.
-- ----------------------------------------------------------
do $mig$
declare
  t record;
  p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);

    -- Remove qualquer política antiga (as `to public using (true)`).
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    loop
      execute format('drop policy %I on public.%I', p.policyname, t.tablename);
    end loop;

    execute format(
      'create policy "equipe autenticada" on public.%I for all to authenticated '
      || 'using (public.gc_atual() is not null) '
      || 'with check (public.gc_atual() is not null)',
      t.tablename
    );
  end loop;
end
$mig$;

-- ----------------------------------------------------------
-- 3. O papel `anon` perde tudo
--
-- Nenhuma tela do CRM lê tabela antes do login, e as rotas de servidor que
-- usavam a chave anônima (webhook do agente de voz, captura de lead, crons)
-- foram migradas pra chave de serviço junto com esta migration.
-- O `alter default privileges` evita que tabelas criadas no futuro nasçam
-- abertas de novo.
-- ----------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ----------------------------------------------------------
-- 4. integracoes_google: caso especial (guarda tokens do Google)
--
-- Cada pessoa só enxerga/mexe na própria integração. E mesmo o dono não
-- consegue ler access_token/refresh_token pelo navegador: quem precisa
-- deles é o servidor, que usa a chave de serviço (ignora RLS e grants).
-- Sem isso, bastava a sessão de um comercial pra extrair o token e agir
-- na conta Google dele fora do CRM.
-- ----------------------------------------------------------
drop policy if exists "equipe autenticada" on public.integracoes_google;

create policy "integracao google: dono lê" on public.integracoes_google
  for select to authenticated
  using (gc_id = public.gc_atual());

create policy "integracao google: dono atualiza" on public.integracoes_google
  for update to authenticated
  using (gc_id = public.gc_atual())
  with check (gc_id = public.gc_atual());

create policy "integracao google: dono apaga" on public.integracoes_google
  for delete to authenticated
  using (gc_id = public.gc_atual());

-- Grant no nível de coluna: revoga o SELECT da tabela inteira e devolve
-- só as colunas não sensíveis (grant de tabela sobrepõe revoke de coluna,
-- então a ordem importa).
revoke select on public.integracoes_google from authenticated;
grant select (id, gc_id, email_google, compartilhar_agenda, expira_em, criado_em, atualizado_em)
  on public.integracoes_google to authenticated;
grant update (compartilhar_agenda) on public.integracoes_google to authenticated;

-- ----------------------------------------------------------
-- 5. Storage: leitura continua pública, escrita não
--
-- A leitura precisa seguir pública porque as URLs de mídia são entregues
-- direto pro WhatsApp/Instagram e renderizadas no app. Mas upload e
-- exclusão estavam liberados pra qualquer um — dava pra encher o storage
-- da conta (custo) ou apagar anexos de propostas de clientes.
-- ----------------------------------------------------------
drop policy if exists "whatsapp media upload publico" on storage.objects;
create policy "whatsapp media upload autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'whatsapp-media');

drop policy if exists "instagram media upload publico" on storage.objects;
create policy "instagram media upload autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'instagram-media');

drop policy if exists "avatares upload publico" on storage.objects;
create policy "avatares upload autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatares');

drop policy if exists "anexos upload publico" on storage.objects;
create policy "anexos upload autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos');

drop policy if exists "anexos exclusao publica" on storage.objects;
create policy "anexos exclusao autenticada" on storage.objects
  for delete to authenticated using (bucket_id = 'anexos');
