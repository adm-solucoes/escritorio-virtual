import { criarEventoReuniao } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { gcId } = await request.json();
  const inicio = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const fim = new Date(inicio.getTime() + 30 * 60 * 1000);
  const resultado = await criarEventoReuniao({
    gcId,
    titulo: "Teste agenda compartilhada — pode excluir",
    descricao: "Evento de teste (verificar listagem na Agenda da equipe).",
    participanteEmail: null,
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
  });
  return Response.json(resultado);
}
