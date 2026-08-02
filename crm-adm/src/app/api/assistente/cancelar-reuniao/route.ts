import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { z } from "zod";
import { excluirEvento } from "@/lib/google-calendar";
import { lerCorpoValidado, textoLivre } from "@/lib/validacao";

export const dynamic = "force-dynamic";

// eventoId é id do Google Calendar (alfanumérico), não UUID nosso.
const schema = z.object({ eventoId: textoLivre(200).min(1) });

export async function POST(request: Request) {
  try {
    const corpo = await lerCorpoValidado(request, schema);
    if (!corpo.ok) return corpo.resposta;
    const { eventoId } = corpo.dados;

    // gcId sempre da sessão real, nunca do corpo — mesmo motivo das outras
    // rotas do assistente: sem isso, dava pra cancelar reunião na agenda de
    // qualquer pessoa só trocando o gcId enviado.
    const supabaseSessao = await createServerClient();
    const {
      data: { user },
    } = await supabaseSessao.auth.getUser();
    if (!user?.email) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: gcAtual } = await admin.from("gcs").select("id, role").eq("email", user.email).maybeSingle();
    if (!gcAtual || gcAtual.role === "sem_acesso") {
      return Response.json({ error: "Sem acesso a dados comerciais." }, { status: 403 });
    }

    const resultado = await excluirEvento(gcAtual.id, eventoId);
    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
