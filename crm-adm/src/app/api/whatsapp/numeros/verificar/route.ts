import { createAdminClient } from "@/lib/supabase-admin";
import { verificarCodigo } from "@/lib/whatsapp-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
