-- Fase H — Anexos por empresa/oportunidade. Migração aditiva.
-- Storage: Supabase Storage (já em uso no projeto pro bucket "whatsapp-media").

create table if not exists anexos (
  id uuid primary key default gen_random_uuid(),
  registro_tipo text not null check (registro_tipo in ('empresa', 'oportunidade')),
  registro_id uuid not null,
  nome_arquivo text not null,
  caminho_storage text not null,
  tamanho_bytes bigint,
  tipo_mime text,
  enviado_por_gc_id uuid references gcs(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_anexos_registro on anexos(registro_tipo, registro_id);

alter table anexos enable row level security;
drop policy if exists "acesso liberado anexos" on anexos;
create policy "acesso liberado anexos" on anexos for all to public using (true) with check (true);

-- Bucket público (mesmo modelo do whatsapp-media) para os arquivos.
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', true)
on conflict (id) do nothing;

drop policy if exists "anexos leitura publica" on storage.objects;
create policy "anexos leitura publica" on storage.objects
  for select to public using (bucket_id = 'anexos');

drop policy if exists "anexos upload publico" on storage.objects;
create policy "anexos upload publico" on storage.objects
  for insert to public with check (bucket_id = 'anexos');

drop policy if exists "anexos exclusao publica" on storage.objects;
create policy "anexos exclusao publica" on storage.objects
  for delete to public using (bucket_id = 'anexos');
