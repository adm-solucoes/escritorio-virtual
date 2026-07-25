import { createAdminClient } from "@/lib/supabase-admin";
import { adicionarNumero, solicitarCodigo } from "@/lib/whatsapp-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("whatsapp_numeros").select("*").order("criado_em", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ numeros: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const { cc, numero, nomeExibicao } = await request.json();
    if (!cc || !numero || !nomeExibicao) {
      return Response.json({ error: "Preencha DDI, número e nome de exibição" }, { status: 400 });
    }

    const resultado = await adicionarNumero(cc, numero, nomeExibicao);
    if (!resultado.ok || !resultado.phoneNumberId) {
      return Response.json({ error: resultado.error ?? "Erro ao adicionar número" }, { status: 400 });
    }

    const codigo = await solicitarCodigo(resultado.phoneNumberId, "SMS");
    if (!codigo.ok) {
      return Response.json({ error: codigo.error ?? "Número criado, mas erro ao enviar código" }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from("whatsapp_numeros").insert({
      phone_number_id: resultado.phoneNumberId,
      numero: `${cc}${numero}`,
      nome_exibicao: nomeExibicao,
      status: "pendente",
      ativo: false,
    });

    return Response.json({ ok: true, phoneNumberId: resultado.phoneNumberId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
