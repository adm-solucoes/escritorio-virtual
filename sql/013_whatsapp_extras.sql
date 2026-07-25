-- Extensões da integração WhatsApp:
-- 1) guarda o nome de perfil cadastrado pelo próprio cliente no WhatsApp dele
-- 2) mensagens de mídia (imagem/documento/áudio) e notas internas (não enviadas ao cliente)

alter table whatsapp_conversas add column if not exists nome_perfil_whatsapp text;

alter table whatsapp_mensagens add column if not exists interna boolean not null default false;
alter table whatsapp_mensagens add column if not exists midia_url text;
alter table whatsapp_mensagens add column if not exists midia_nome text;

alter table whatsapp_mensagens drop constraint if exists whatsapp_mensagens_tipo_check;
alter table whatsapp_mensagens add constraint whatsapp_mensagens_tipo_check
  check (tipo in ('texto', 'template', 'midia', 'imagem', 'documento', 'audio', 'nota'));

-- Bucket público para os arquivos enviados nas conversas (imagens, documentos, áudios)
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', true)
on conflict (id) do nothing;

drop policy if exists "whatsapp media leitura publica" on storage.objects;
create policy "whatsapp media leitura publica" on storage.objects
  for select to public using (bucket_id = 'whatsapp-media');

drop policy if exists "whatsapp media upload publico" on storage.objects;
create policy "whatsapp media upload publico" on storage.objects
  for insert to public with check (bucket_id = 'whatsapp-media');
