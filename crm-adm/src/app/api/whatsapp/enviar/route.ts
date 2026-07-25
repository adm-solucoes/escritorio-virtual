import { createAdminClient } from "@/lib/supabase-admin";
import { enviarMidia, enviarTemplate, enviarTexto } from "@/lib/whatsapp-api";

export const dynamic = "force-dynamic";

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

const TIPO_MIDIA_PARA_GRAPH: Record<string, "image" | "document" | "audio"> = {
  imagem: "image",
  documento: "document",
  audio: "audio",
};

export async function POST(request: Request) {
  try {
    const { conversaId, texto, template, midia, nota, gcId } = await request.json();
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

    const gc = gcId ? (await admin.from("gcs").select("nome").eq("id", gcId).maybeSingle()).data : null;

    // Nota interna: fica só no CRM, nunca é enviada pra Meta/cliente.
    if (nota) {
      await admin.from("whatsapp_mensagens").insert({
        conversa_id: conversaId,
        direcao: "enviada",
        conteudo: nota,
        tipo: "nota",
        interna: true,
        enviado_por_gc_id: gcId ?? null,
      });
      await admin.from("whatsapp_conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversaId);
      return Response.json({ ok: true });
    }

    // Janela de 24h da Meta: só dá pra mandar texto/mídia livre se o cliente
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

    const assinatura = gc?.nome ? `*${gc.nome} • ADM Soluções*` : null;

    let resultado;
    let conteudo: string;
    let tipo: string;
    let midiaUrl: string | null = null;
    let midiaNome: string | null = null;

    if (midia) {
      const tipoGraph = TIPO_MIDIA_PARA_GRAPH[midia.tipo];
      if (!tipoGraph) return Response.json({ error: "Tipo de mídia inválido" }, { status: 400 });
      resultado = await enviarMidia(conversa.telefone, tipoGraph, midia.url, assinatura ?? undefined, midia.nome);
      conteudo = midia.nome ?? `[${midia.tipo}]`;
      tipo = midia.tipo;
      midiaUrl = midia.url;
      midiaNome = midia.nome ?? null;
    } else if (template) {
      resultado = await enviarTemplate(conversa.telefone, template.nome, template.idioma, template.parametros ?? []);
      conteudo = `[template] ${template.nome}`;
      tipo = "template";
    } else {
      const textoFinal = assinatura ? `${assinatura}\n${texto}` : texto;
      resultado = await enviarTexto(conversa.telefone, textoFinal);
      conteudo = texto;
      tipo = "texto";
    }

    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    await admin.from("whatsapp_mensagens").insert({
      conversa_id: conversaId,
      direcao: "enviada",
      conteudo,
      tipo,
      midia_url: midiaUrl,
      midia_nome: midiaNome,
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
