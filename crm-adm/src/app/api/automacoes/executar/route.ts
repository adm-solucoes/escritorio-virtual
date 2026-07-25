import { executarAutomacoesAtivas } from "@/lib/automacoes-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamada manual (botão "Executar agora" no canvas, opcional) — sem checar o CRON_SECRET.
export async function POST() {
  try {
    const resultado = await executarAutomacoesAtivas();
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

// Cron da Vercel — gatilhos de tempo (data/hora, sem contato, atividade atrasada).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const resultado = await executarAutomacoesAtivas();
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("Erro ao executar automações:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
