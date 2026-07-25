import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
