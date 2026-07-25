import { criarEventoReuniao } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { gcId } = await request.json();
  const inicio = new Date(Date.now() + 60 * 60 * 1000);
  const fim = new Date(inicio.getTime() + 30 * 60 * 1000);
  const resultado = await criarEventoReuniao({
    gcId,
    titulo: "Teste de integração — CRM Automações",
    descricao: "Evento de teste criado pela automação (pode excluir).",
    participanteEmail: null,
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
  });
  return Response.json(resultado);
}
