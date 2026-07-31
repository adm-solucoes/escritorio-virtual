-- ==========================================================
-- CORREÇÃO: escalonamento de privilégio (privilege escalation)
--
-- A migration 034 fechou o banco pro público, mas deixou uma política única
-- "equipe autenticada" que dá acesso TOTAL a qualquer GC logado. Testado ao
-- vivo com um usuário comercial de teste: ele conseguiu rodar, do próprio
-- navegador,
--
--     supabase.from("gcs").update({ role: "gestor" }).eq("email", <o dele>)
--
-- e virar gestor sozinho. A tela esconde esse botão de quem não é gestor,
-- mas a checagem era só no front — o banco aceitava. Também dava pra editar
-- oportunidade/empresa de qualquer outro GC.
--
-- Esta migration tranca a tabela `gcs`: dá pra ler o time todo (o app precisa
-- disso em várias telas), mas trocar papel/status/e-mail só pelo servidor
-- (rota /api/membros/atualizar, protegida por sessão de gestor, que usa a
-- chave de serviço e ignora o RLS). O usuário só pode mexer, na PRÓPRIA
-- linha, em nome e foto — nada de privilégio.
-- ==========================================================

-- Troca a política genérica da 034 na tabela gcs por regras específicas.
drop policy if exists "equipe autenticada" on public.gcs;

-- Leitura: qualquer GC ativo vê a lista da equipe (usado no seletor de
-- responsável, no calendário, no chat de IA, etc.).
create policy "gcs: leitura pela equipe" on public.gcs
  for select to authenticated
  using (public.gc_atual() is not null);

-- Escrita: só na própria linha. As COLUNAS que podem mudar são limitadas
-- pelo grant abaixo (nome e foto) — role/status/email nem o gestor muda por
-- aqui, vai pela rota de servidor.
create policy "gcs: usuario edita a propria linha" on public.gcs
  for update to authenticated
  using (id = public.gc_atual())
  with check (id = public.gc_atual());

-- INSERT/DELETE de GC: sem política pra authenticated => proibido pelo
-- cliente. Convite e remoção de membro acontecem no servidor (chave de
-- serviço, que ignora RLS), sempre com checagem de gestor.

-- Grant no nível de coluna: o papel `authenticated` (compartilhado por
-- gestor e comercial — a diferença é só no JWT/gc_atual, não no papel do
-- Postgres) só pode escrever nome e foto. Assim, mesmo montando a query na
-- mão no console, ninguém consegue setar role/status/email/ordem daqui.
revoke update on public.gcs from authenticated;
grant update (nome, foto_url) on public.gcs to authenticated;
