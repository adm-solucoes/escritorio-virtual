import { createAdminClient } from "@/lib/supabase-admin";
import { enviarMidia, enviarTexto } from "@/lib/instagram-api";

export const dynamic = "force-dynamic";

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

const TIPO_MIDIA_PARA_GRAPH: Record<string, "image" | "video"> = {
  imagem: "image",
  video: "video",
};

export async function POST(request: Request) {
  try {
    const { conversaId, texto, midia, nota, gcId } = await request.json();
    if (!conversaId) {
      return Response.json({ error: "conversaId é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: conversa, error: erroConversa } = await admin
      .from("instagram_conversas")
      .select("*")
      .eq("id", conversaId)
      .single();

    if (erroConversa || !conversa) {
      return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    // Nota interna: fica só no CRM, nunca é enviada pra Meta/cliente.
    if (nota) {
      await admin.from("instagram_mensagens").insert({
        conversa_id: conversaId,
        direcao: "enviada",
        conteudo: nota,
        tipo: "nota",
        interna: true,
        enviado_por_gc_id: gcId ?? null,
      });
      await admin.from("instagram_conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversaId);
      return Response.json({ ok: true });
    }

    // Janela de 24h: o Instagram não tem template pra reabrir — fora da janela,
    // a Meta simplesmente recusa o envio até o contato escrever de novo.
    const { data: ultimaRecebida } = await admin
      .from("instagram_mensagens")
      .select("criado_em")
      .eq("conversa_id", conversaId)
      .eq("direcao", "recebida")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dentroDaJanela = ultimaRecebida
      ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < JANELA_24H_MS
      : false;

    if (!dentroDaJanela) {
      return Response.json(
        { error: "Fora da janela de 24h — o Instagram não permite reabrir a conversa automaticamente. Espere o contato escrever de novo." },
        { status: 400 }
      );
    }

    const gc = gcId ? (await admin.from("gcs").select("nome").eq("id", gcId).maybeSingle()).data : null;
    const primeiroNome = gc?.nome ? gc.nome.trim().split(/\s+/)[0] : null;

    let resultado;
    let conteudo: string;
    let tipo: string;
    let midiaUrl: string | null = null;
    let midiaNome: string | null = null;

    if (midia) {
      const tipoGraph = TIPO_MIDIA_PARA_GRAPH[midia.tipo];
      if (!tipoGraph) return Response.json({ error: "Tipo de mídia inválido" }, { status: 400 });
      resultado = await enviarMidia(conversa.instagram_scoped_id, tipoGraph, midia.url);
      tipo = midia.tipo;
      conteudo = midia.nome ?? `[${midia.tipo}]`;
      midiaUrl = midia.url;
      midiaNome = midia.nome ?? null;
    } else {
      const assinatura = primeiroNome ? `${primeiroNome}:\n` : "";
      resultado = await enviarTexto(conversa.instagram_scoped_id, `${assinatura}${texto}`);
      conteudo = texto;
      tipo = "texto";
    }

    if (!resultado.ok) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    await admin.from("instagram_mensagens").insert({
      conversa_id: conversaId,
      direcao: "enviada",
      conteudo,
      tipo,
      midia_url: midiaUrl,
      midia_nome: midiaNome,
      enviado_por_gc_id: gcId ?? null,
      instagram_message_id: resultado.messageId,
      status_entrega: "enviado",
    });

    await admin.from("instagram_conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversaId);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
