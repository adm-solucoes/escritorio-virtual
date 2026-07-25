import { listarTemplates } from "@/lib/whatsapp-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await listarTemplates();
    return Response.json({ templates });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido", templates: [] }, { status: 500 });
  }
}
