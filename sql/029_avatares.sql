-- Foto de perfil dos GCs (usada na barra lateral e nas mensagens que eles enviam).

alter table gcs add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

drop policy if exists "avatares leitura publica" on storage.objects;
create policy "avatares leitura publica" on storage.objects
  for select to public using (bucket_id = 'avatares');

drop policy if exists "avatares upload publico" on storage.objects;
create policy "avatares upload publico" on storage.objects
  for insert to public with check (bucket_id = 'avatares');
