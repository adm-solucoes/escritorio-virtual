import { z } from "zod";
import { interpretarComandoIA } from "@/lib/acao-rapida-parser-ia";
import { exigirSessao } from "@/lib/auth-api";
import { lerCorpoValidado, textoLivre } from "@/lib/validacao";

export const dynamic = "force-dynamic";

// 2000 caracteres: um comando de ação rápida é uma frase. O teto existe
// porque cada chamada vira token pago na Anthropic — sem ele, um texto
// gigante custa dinheiro de verdade.
const schema = z.object({ texto: textoLivre(2000).min(1) });

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const corpo = await lerCorpoValidado(request, schema);
  if (!corpo.ok) return corpo.resposta;
  const { texto } = corpo.dados;
  if (!texto.trim()) {
    return Response.json({ error: "Texto vazio" }, { status: 400 });
  }

  try {
    const comando = await interpretarComandoIA(texto);
    if (!comando) {
      return Response.json({ error: "Não consegui entender esse comando." }, { status: 200 });
    }
    return Response.json({ comando });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro ao interpretar" }, { status: 500 });
  }
}
