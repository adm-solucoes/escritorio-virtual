-- ==========================================================
-- CORREÇÃO: enumeração anônima do storage
--
-- Os 4 buckets (whatsapp-media, instagram-media, anexos, avatares) são
-- públicos (public=true) — o que é necessário: a exibição de imagem no app e
-- o envio de mídia pra Meta usam a URL pública direta. MAS a política de
-- SELECT estava liberada pra `public`, o que também deixa qualquer pessoa
-- LISTAR os objetos (endpoint /storage/v1/object/list) e assim descobrir e
-- baixar todas as mídias de conversa de cliente e anexos de proposta.
--
-- Testado: listagem anônima devolvia os objetos do whatsapp-media.
--
-- Correção: a listagem passa a exigir login (`authenticated`). O download por
-- URL pública continua funcionando (buckets públicos servem por
-- /object/public/... sem consultar RLS), então nada quebra no app nem no
-- envio de mídia pra Meta — só acaba a enumeração por quem não está logado.
-- O app nunca lista objetos via API (confirmado no código), então exigir
-- login aqui não afeta nenhuma tela.
-- ==========================================================

-- Remove QUALQUER política de SELECT em storage.objects concedida a `public`
-- ou `anon` (independe do nome exato — se sobrar uma `to public`, o RLS soma
-- as políticas por OU e a listagem anônima continuaria valendo). Só mexe em
-- SELECT; upload/delete já foram tratados na 034 e ficam como estão.
do $st$
declare
  p record;
begin
  for p in
    select policyname, roles, cmd
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and (roles && array['public','anon']::name[])
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$st$;

-- Recria a leitura restrita a usuários logados, bucket a bucket.
drop policy if exists "whatsapp media leitura autenticada" on storage.objects;
create policy "whatsapp media leitura autenticada" on storage.objects
  for select to authenticated using (bucket_id = 'whatsapp-media');

drop policy if exists "instagram media leitura autenticada" on storage.objects;
create policy "instagram media leitura autenticada" on storage.objects
  for select to authenticated using (bucket_id = 'instagram-media');

drop policy if exists "anexos leitura autenticada" on storage.objects;
create policy "anexos leitura autenticada" on storage.objects
  for select to authenticated using (bucket_id = 'anexos');

drop policy if exists "avatares leitura autenticada" on storage.objects;
create policy "avatares leitura autenticada" on storage.objects
  for select to authenticated using (bucket_id = 'avatares');
