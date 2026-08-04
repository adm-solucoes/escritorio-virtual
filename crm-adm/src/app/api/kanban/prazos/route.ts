import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { emailPrazos } from "@/lib/kanban-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resumo diário de prazos: um e-mail por pessoa, com os cartões dela que
 * venceram ou vencem hoje.
 *
 * Agrupado por pessoa de propósito — mandar um e-mail por cartão vira spam e
 * a pessoa passa a ignorar todos, que é o oposto do objetivo.
 *
 * Protegida por CRON_SECRET: sem isso, qualquer um que descobrisse a URL
 * dispararia e-mail pra equipe inteira à vontade.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return Response.json({ error: "CRON_SECRET não configurado neste ambiente." }, { status: 503 });
  }

  const autorizacao = request.headers.get("authorization");
  const viaHeader = autorizacao === `Bearer ${segredo}`;
  const viaQuery = new URL(request.url).searchParams.get("secret") === segredo;
  if (!viaHeader && !viaQuery) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Janela: tudo que vence até o fim do dia de hoje e ainda não foi concluído.
  const fimDeHoje = new Date();
  fimDeHoje.setHours(23, 59, 59, 999);

  const { data: cartoes, error } = await admin
    .from("kanban_cartoes")
    .select(
      "id, titulo, prazo, kanban_listas(nome, kanban_quadros(nome)), kanban_cartao_membros(gc_id, gcs(nome, email, status))"
    )
    .eq("arquivado", false)
    .eq("prazo_concluido", false)
    .not("prazo", "is", null)
    .lte("prazo", fimDeHoje.toISOString());

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const inicioDeHoje = new Date();
  inicioDeHoje.setHours(0, 0, 0, 0);

  type Pendencia = { titulo: string; quadro: string; prazo: string };
  const porPessoa = new Map<
    string,
    { nome: string; email: string; vencidos: Pendencia[]; vencemHoje: Pendencia[] }
  >();

  for (const c of (cartoes ?? []) as unknown as {
    titulo: string;
    prazo: string;
    kanban_listas: { nome: string; kanban_quadros: { nome: string } | null } | null;
    kanban_cartao_membros: { gc_id: string; gcs: { nome: string; email: string; status: string } | null }[];
  }[]) {
    const quadro = c.kanban_listas?.kanban_quadros?.nome ?? "Kanban";
    const venceu = new Date(c.prazo) < inicioDeHoje;

    for (const m of c.kanban_cartao_membros ?? []) {
      const gc = m.gcs;
      if (!gc?.email || gc.status !== "Ativo") continue;

      if (!porPessoa.has(m.gc_id)) {
        porPessoa.set(m.gc_id, { nome: gc.nome, email: gc.email, vencidos: [], vencemHoje: [] });
      }
      const alvo = porPessoa.get(m.gc_id)!;
      const item = { titulo: c.titulo, quadro, prazo: c.prazo };
      if (venceu) alvo.vencidos.push(item);
      else alvo.vencemHoje.push(item);
    }
  }

  let enviados = 0;
  const falhas: string[] = [];

  for (const pessoa of porPessoa.values()) {
    const { assunto, html } = emailPrazos({
      nomeDestinatario: pessoa.nome,
      vencidos: pessoa.vencidos,
      vencemHoje: pessoa.vencemHoje,
    });
    const envio = await enviarEmail({ para: [pessoa.email], assunto, html });
    if (envio.ok) enviados++;
    else falhas.push(`${pessoa.nome}: ${envio.error}`);
  }

  return Response.json({
    ok: true,
    pessoasNotificadas: enviados,
    cartoesConsiderados: (cartoes ?? []).length,
    falhas,
  });
}
