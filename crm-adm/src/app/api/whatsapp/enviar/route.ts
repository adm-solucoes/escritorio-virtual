import { createAdminClient } from "@/lib/supabase-admin";
import { enviarTemplate, enviarTexto } from "@/lib/whatsapp-api";

export const dynamic = "force-dynamic";

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { conversaId, texto, template, gcId } = await request.json();
    if (!conversaId) {
      return Response.json({ error: "conversaId é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: conversa, error: erroConversa } = await admin
      .from("whatsapp_conversas")
      .select("*")
      .eq("id", conversaId)
      .single();

    if (erroConversa || !conversa) {
      return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    // Janela de 24h da Meta: só dá pra mandar texto livre se o cliente
    // mandou mensagem nas últimas 24h. Fora disso, só template aprovado.
    const { data: ultimaRecebida } = await admin
      .from("whatsapp_mensagens")
      .select("criado_em")
      .eq("conversa_id", conversaId)
      .eq("direcao", "recebida")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dentroDaJanela = ultimaRecebida
      ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < JANELA_24H_MS
      : false;

    if (!template && !dentroDaJanela) {
      return Response.json(
        { error: "Fora da janela de 24h — use um template aprovado pra iniciar a conversa de novo." },
        { status: 400 }
      );
    }

    const resultado = template
      ? await enviarTemplate(conversa.telefone, template.nome, template.idioma, template.parametros ?? [])
      : await enviarTexto(conversa.telefone, texto);

    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    await admin.from("whatsapp_mensagens").insert({
      conversa_id: conversaId,
      direcao: "enviada",
      conteudo: template ? `[template] ${template.nome}` : texto,
      tipo: template ? "template" : "texto",
      enviado_por_gc_id: gcId ?? null,
      whatsapp_message_id: resultado.messageId,
      status_entrega: "enviado",
    });

    await admin.from("whatsapp_conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversaId);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
