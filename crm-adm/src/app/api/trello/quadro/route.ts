import { exigirSessao } from "@/lib/auth-api";
import { lerQuadro, trelloConfigurado } from "@/lib/trello";

export const dynamic = "force-dynamic";

/**
 * Devolve o quadro do Trello (listas + cartões) pra tela /kanban.
 *
 * Existe como rota de servidor — e não como chamada direta do navegador pra
 * api.trello.com — porque o token do Trello dá acesso à conta inteira. Ele
 * fica só aqui; o cliente recebe apenas os dados já filtrados.
 */
export async function GET() {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  if (!trelloConfigurado()) {
    return Response.json(
      { error: "Trello não configurado neste ambiente (faltam as variáveis TRELLO_*)." },
      { status: 503 }
    );
  }

  try {
    const quadro = await lerQuadro();
    return Response.json(quadro);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar o Trello." },
      { status: 502 }
    );
  }
}
