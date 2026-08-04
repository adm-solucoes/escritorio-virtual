import { z } from "zod";
import { exigirSessao } from "@/lib/auth-api";
import { createAdminClient } from "@/lib/supabase-admin";
import { lerCorpoValidado, uuidValido } from "@/lib/validacao";
import { enviarEmail } from "@/lib/email";
import { emailAtribuicao, emailComentario } from "@/lib/kanban-email";

export const dynamic = "force-dynamic";

const schema = z.object({
  tipo: z.enum(["atribuicao", "comentario"]),
  cartaoId: uuidValido,
  /** Só em "atribuicao": quem acabou de virar responsável. */
  destinatarioGcId: uuidValido.optional(),
  /** Só em "comentario": o texto, pra ir no corpo do e-mail. */
  texto: z.string().trim().max(2000).optional(),
});

/**
 * Dispara o e-mail de aviso do Kanban.
 *
 * Roda no servidor porque a chave do Resend não pode ir pro navegador. E todo
 * o CONTEÚDO do e-mail é lido do banco aqui — o cliente manda só os ids. Se o
 * texto viesse do cliente, daria pra usar esta rota pra mandar e-mail com
 * conteúdo arbitrário em nome da ADM Soluções.
 *
 * Falha de e-mail nunca derruba a ação que a originou: quem chama dispara e
 * segue a vida (a pessoa já foi atribuída, o comentário já foi salvo).
 */
export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const corpo = await lerCorpoValidado(request, schema);
  if (!corpo.ok) return corpo.resposta;
  const { tipo, cartaoId, destinatarioGcId } = corpo.dados;

  const admin = createAdminClient();

  // Cartão + a lista e o quadro a que pertence (pro e-mail dizer "onde").
  const { data: cartao } = await admin
    .from("kanban_cartoes")
    .select("id, titulo, descricao, prazo, kanban_listas(nome, kanban_quadros(nome))")
    .eq("id", cartaoId)
    .maybeSingle();

  if (!cartao) return Response.json({ error: "Cartão não encontrado." }, { status: 404 });

  const lista = cartao.kanban_listas as unknown as
    | { nome: string; kanban_quadros: { nome: string } | null }
    | null;
  const nomeLista = lista?.nome ?? "—";
  const nomeQuadro = lista?.kanban_quadros?.nome ?? "Kanban";
  const quemAgiu = sessao.gc.nome;

  if (tipo === "atribuicao") {
    if (!destinatarioGcId) {
      return Response.json({ error: "destinatarioGcId é obrigatório para atribuição." }, { status: 400 });
    }
    // Ninguém precisa de e-mail por ter atribuído a si mesmo.
    if (destinatarioGcId === sessao.gc.id) return Response.json({ ok: true, pulado: "auto-atribuição" });

    const { data: destino } = await admin
      .from("gcs")
      .select("nome, email, status")
      .eq("id", destinatarioGcId)
      .maybeSingle();

    if (!destino?.email || destino.status !== "Ativo") {
      return Response.json({ ok: true, pulado: "destinatário sem e-mail ou inativo" });
    }

    const { assunto, html } = emailAtribuicao({
      nomeDestinatario: destino.nome,
      quemAtribuiu: quemAgiu,
      tituloCartao: cartao.titulo,
      nomeQuadro,
      nomeLista,
      prazo: cartao.prazo,
      descricao: cartao.descricao,
    });

    const envio = await enviarEmail({ para: [destino.email], assunto, html });
    return Response.json({ ok: envio.ok, error: envio.error });
  }

  // ---- comentário: avisa os responsáveis do cartão, menos quem comentou ----
  const { data: membros } = await admin
    .from("kanban_cartao_membros")
    .select("gc_id, gcs(nome, email, status)")
    .eq("cartao_id", cartaoId);

  const destinatarios = ((membros ?? []) as unknown as {
    gc_id: string;
    gcs: { nome: string; email: string; status: string } | null;
  }[])
    .filter((m) => m.gc_id !== sessao.gc.id && m.gcs?.email && m.gcs.status === "Ativo")
    .map((m) => m.gcs!);

  if (destinatarios.length === 0) return Response.json({ ok: true, pulado: "sem responsáveis para avisar" });

  let enviados = 0;
  for (const d of destinatarios) {
    const { assunto, html } = emailComentario({
      nomeDestinatario: d.nome,
      quemComentou: quemAgiu,
      tituloCartao: cartao.titulo,
      nomeQuadro,
      texto: corpo.dados.texto ?? "",
    });
    const envio = await enviarEmail({ para: [d.email], assunto, html });
    if (envio.ok) enviados++;
  }

  return Response.json({ ok: true, enviados });
}
