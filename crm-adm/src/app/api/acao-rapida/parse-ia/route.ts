import { interpretarComandoIA } from "@/lib/acao-rapida-parser-ia";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const { texto } = await request.json();
  if (typeof texto !== "string" || !texto.trim()) {
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
