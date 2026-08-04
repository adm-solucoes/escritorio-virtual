import { z } from "zod";
import { exigirSessao } from "@/lib/auth-api";
import { createAdminClient } from "@/lib/supabase-admin";
import { lerCorpoValidado, uuidValido } from "@/lib/validacao";
import { criarCartaoDeSolicitacao, etiquetaDaArea, trelloConfigurado } from "@/lib/trello";

export const dynamic = "force-dynamic";

const schema = z.object({ solicitacaoId: uuidValido });

/**
 * Cria um cartão no Backlog do Trello a partir de uma solicitação do CRM.
 *
 * Idempotente: se a solicitação já tem `trello_card_url`, devolve o cartão
 * existente em vez de criar outro. Sem isso, cada clique no botão encheria o
 * Backlog de cartões repetidos — e apagar cartão no Trello é manual.
 *
 * O id da solicitação vem do corpo, mas TODO o conteúdo do cartão é lido do
 * banco aqui no servidor: nada do que o cliente manda vira texto do cartão.
 */
export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  if (!trelloConfigurado()) {
    return Response.json({ error: "Trello não configurado neste ambiente." }, { status: 503 });
  }

  const corpo = await lerCorpoValidado(request, schema);
  if (!corpo.ok) return corpo.resposta;

  const admin = createAdminClient();
  const { data: solicitacao, error } = await admin
    .from("solicitacoes")
    .select(
      "id, nome_evento_projeto, objetivo, justificativa, area, prazo, data_evento, recursos_necessarios, status, trello_card_url"
    )
    .eq("id", corpo.dados.solicitacaoId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!solicitacao) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });

  // Já foi enviada antes — devolve o mesmo cartão.
  if (solicitacao.trello_card_url) {
    return Response.json({ url: solicitacao.trello_card_url, jaExistia: true });
  }

  const descricao = [
    solicitacao.objetivo ? `**Objetivo**\n${solicitacao.objetivo}` : null,
    solicitacao.justificativa ? `**Justificativa**\n${solicitacao.justificativa}` : null,
    solicitacao.recursos_necessarios ? `**Recursos necessários**\n${solicitacao.recursos_necessarios}` : null,
    solicitacao.data_evento ? `**Data do evento:** ${solicitacao.data_evento}` : null,
    solicitacao.area ? `**Área:** ${solicitacao.area}` : null,
    `\n---\nCriado a partir de uma solicitação do CRM.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const cartao = await criarCartaoDeSolicitacao({
      titulo: solicitacao.nome_evento_projeto || "Solicitação sem título",
      descricao,
      area: solicitacao.area,
      // `prazo` no banco é uma data (sem hora); o Trello aceita ISO.
      prazo: solicitacao.prazo ? new Date(solicitacao.prazo).toISOString() : null,
    });

    await admin
      .from("solicitacoes")
      .update({ trello_card_id: cartao.id, trello_card_url: cartao.url })
      .eq("id", solicitacao.id);

    return Response.json({
      url: cartao.url,
      jaExistia: false,
      etiqueta: etiquetaDaArea(solicitacao.area),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao criar o cartão no Trello." },
      { status: 502 }
    );
  }
}
