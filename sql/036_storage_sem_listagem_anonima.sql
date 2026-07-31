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

-- Remove as políticas antigas de leitura pública (nomes exatos das migrations
-- originais: 013_whatsapp_extras, 025_instagram, 023_fase_h_anexos, 029_avatares).
drop policy if exists "whatsapp media leitura publica" on storage.objects;
drop policy if exists "instagram media leitura publica" on storage.objects;
drop policy if exists "anexos leitura publica" on storage.objects;
drop policy if exists "avatares leitura publica" on storage.objects;

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
