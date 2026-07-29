import { excluirEvento } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { gcId, eventoId } = await request.json();
    if (typeof gcId !== "string" || typeof eventoId !== "string") {
      return Response.json({ error: "gcId e eventoId são obrigatórios" }, { status: 400 });
    }

    const resultado = await excluirEvento(gcId, eventoId);
    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
