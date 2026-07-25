-- Permite cadastrar e verificar novos números de WhatsApp Business direto pelo CRM,
-- e escolher qual deles fica ativo (usado pra enviar as mensagens).

create table if not exists whatsapp_numeros (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null unique,
  numero text not null,
  nome_exibicao text,
  status text not null default 'pendente' check (status in ('pendente', 'verificado')),
  ativo boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table whatsapp_conversas add column if not exists phone_number_id text;

alter table whatsapp_numeros enable row level security;
drop policy if exists "acesso liberado whatsapp numeros" on whatsapp_numeros;
create policy "acesso liberado whatsapp numeros" on whatsapp_numeros
  for all to public using (true) with check (true);

-- registra o número de produção que já está em uso hoje como o número ativo
insert into whatsapp_numeros (phone_number_id, numero, nome_exibicao, status, ativo)
values ('1214460401759323', '5585998077506', 'ADM Soluções', 'verificado', true)
on conflict (phone_number_id) do nothing;
