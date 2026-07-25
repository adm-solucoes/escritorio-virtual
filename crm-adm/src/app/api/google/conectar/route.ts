import { gerarUrlAutorizacaoGoogle } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gcId = searchParams.get("gcId");
  if (!gcId) return new Response("gcId é obrigatório", { status: 400 });

  try {
    const url = gerarUrlAutorizacaoGoogle(gcId);
    return Response.redirect(url);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Erro ao gerar link do Google", { status: 500 });
  }
}
