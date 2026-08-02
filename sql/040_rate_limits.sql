-- ==========================================================
-- Rate limiting com estado no Postgres
--
-- Por que no banco e não em memória: a Vercel roda serverless — cada
-- invocação pode cair numa instância diferente, então um contador em
-- memória local zera a toda hora e não limita nada de verdade. O estado
-- precisa ser externo e compartilhado.
--
-- Por que Postgres e não Redis: o Supabase já está aqui e o volume do CRM
-- (time pequeno + alguns endpoints públicos) cabe folgado. Evita mais um
-- serviço externo pra manter, pagar e monitorar.
--
-- Janela fixa (não deslizante): mais simples e suficiente pro objetivo, que
-- é barrar abuso/força-bruta, não fazer traffic shaping fino.
-- ==========================================================

create table if not exists public.rate_limits (
  chave text primary key,
  contador int not null default 0,
  janela_inicio timestamptz not null default now()
);

-- Usado só pela limpeza periódica das janelas velhas.
create index if not exists rate_limits_janela_inicio_idx on public.rate_limits (janela_inicio);

-- ----------------------------------------------------------
-- Consome 1 unidade da cota e devolve o estado resultante.
--
-- A atomicidade vem do `insert ... on conflict do update`: o Postgres pega
-- lock da linha nesse comando, então duas invocações concorrentes da mesma
-- chave nunca leem o mesmo contador e gravam o mesmo valor (o clássico
-- read-modify-write com race que deixaria passar mais que o limite).
--
-- Se a janela já venceu, o mesmo comando reinicia contador e janela — sem
-- precisar de um SELECT antes pra decidir.
-- ----------------------------------------------------------
create or replace function public.consumir_rate_limit(
  p_chave text,
  p_limite int,
  p_janela_segundos int
)
returns table (permitido boolean, restante int, reset_em timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_agora timestamptz := now();
  v_contador int;
  v_janela_inicio timestamptz;
begin
  insert into public.rate_limits as rl (chave, contador, janela_inicio)
  values (p_chave, 1, v_agora)
  on conflict (chave) do update
    set
      contador = case
        when rl.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora then 1
        else rl.contador + 1
      end,
      janela_inicio = case
        when rl.janela_inicio + make_interval(secs => p_janela_segundos) <= v_agora then v_agora
        else rl.janela_inicio
      end
  returning rl.contador, rl.janela_inicio into v_contador, v_janela_inicio;

  -- Limpeza oportunista: ~1% das chamadas varre janelas de mais de 1 dia.
  -- Sem isso a tabela cresce pra sempre (uma linha por IP × rota). Fica
  -- aqui em vez de num cron pra não depender de mais um agendamento.
  if random() < 0.01 then
    delete from public.rate_limits where janela_inicio < v_agora - interval '1 day';
  end if;

  return query select
    v_contador <= p_limite,
    greatest(p_limite - v_contador, 0),
    v_janela_inicio + make_interval(secs => p_janela_segundos);
end;
$fn$;

-- ----------------------------------------------------------
-- Só o servidor (service key) mexe nisso.
--
-- Se o navegador pudesse chamar a função, daria pra queimar a cota de
-- outra pessoa de propósito (basta saber/adivinhar a chave) ou zerar a
-- própria. RLS sem policy nenhuma + revoke = ninguém autenticado enxerga
-- a tabela; a service_role ignora RLS por padrão no Supabase.
-- ----------------------------------------------------------
alter table public.rate_limits enable row level security;

revoke all on public.rate_limits from anon, authenticated;
revoke all on function public.consumir_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, int, int) to service_role;
