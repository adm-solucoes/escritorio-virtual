import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  // Troca qual numero de WhatsApp a empresa inteira usa pra mandar mensagem
  // -- alcance de conta, nao de comercial individual.
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const { phoneNumberId } = await request.json();
    if (!phoneNumberId) {
      return Response.json({ error: "phoneNumberId é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from("whatsapp_numeros").update({ ativo: false }).neq("phone_number_id", phoneNumberId);
    const { error } = await admin.from("whatsapp_numeros").update({ ativo: true }).eq("phone_number_id", phoneNumberId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
