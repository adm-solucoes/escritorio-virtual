import { createAdminClient } from "@/lib/supabase-admin";
import { gerarNotificacoesAtividadesAtrasadas, gerarNotificacoesFollowupEtapa } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    await Promise.all([gerarNotificacoesAtividadesAtrasadas(supabase), gerarNotificacoesFollowupEtapa(supabase)]);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Erro ao gerar notificações:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
