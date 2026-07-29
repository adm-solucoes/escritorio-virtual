import { atualizarEvento, excluirEvento } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Atualiza horário e/ou título — usado pelo editar e pelo arrastar-pra-remarcar da grade. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const gcId = texto(body.gcId);
    if (!gcId) return Response.json({ error: "gcId é obrigatório" }, { status: 400 });

    const resultado = await atualizarEvento({
      gcId,
      eventoId: id,
      titulo: texto(body.titulo) ?? undefined,
      inicioISO: texto(body.inicioISO) ?? undefined,
      fimISO: texto(body.fimISO) ?? undefined,
    });
    if (!resultado.ok) return Response.json({ error: resultado.error }, { status: 400 });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const gcId = searchParams.get("gcId");
  if (!gcId) return Response.json({ error: "gcId é obrigatório" }, { status: 400 });

  const resultado = await excluirEvento(gcId, id);
  if (!resultado.ok) return Response.json({ error: resultado.error }, { status: 400 });

  return Response.json({ ok: true });
}
