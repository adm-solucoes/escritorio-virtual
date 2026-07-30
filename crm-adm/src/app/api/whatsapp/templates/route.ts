import { listarTemplates } from "@/lib/whatsapp-api";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  try {
    const templates = await listarTemplates();
    return Response.json({ templates });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido", templates: [] }, { status: 500 });
  }
}
