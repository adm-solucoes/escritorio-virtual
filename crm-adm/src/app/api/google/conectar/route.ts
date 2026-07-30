import { gerarUrlAutorizacaoGoogle } from "@/lib/google-calendar";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

// O gcId sempre vem da sessão real, nunca da query string — esse id vira o
// "state" do OAuth e no callback (api/google/callback) é usado direto pra
// decidir de qual GC é a integração salva. Se aceitássemos um gcId
// arbitrário aqui, qualquer um (sem nem estar logado) poderia sequestrar a
// integração do Google Calendar de outra pessoa só completando o fluxo de
// autorização com a própria conta Google.
export async function GET() {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return new Response(sessao.erro, { status: sessao.status });

  try {
    const url = gerarUrlAutorizacaoGoogle(sessao.gc.id);
    return Response.redirect(url);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Erro ao gerar link do Google", { status: 500 });
  }
}
