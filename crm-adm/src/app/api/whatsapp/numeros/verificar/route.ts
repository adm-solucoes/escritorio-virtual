import { createAdminClient } from "@/lib/supabase-admin";
import { verificarCodigo } from "@/lib/whatsapp-api";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const { phoneNumberId, codigo } = await request.json();
    if (!phoneNumberId || !codigo) {
      return Response.json({ error: "phoneNumberId e código são obrigatórios" }, { status: 400 });
    }

    const resultado = await verificarCodigo(phoneNumberId, codigo);
    if (!resultado.ok) {
      return Response.json({ error: resultado.error ?? "Código inválido" }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from("whatsapp_numeros").update({ status: "verificado" }).eq("phone_number_id", phoneNumberId);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
