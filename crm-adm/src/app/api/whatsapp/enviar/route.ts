import { createAdminClient } from "@/lib/supabase-admin";
import { enviarMidia, enviarTemplate, enviarTexto } from "@/lib/whatsapp-api";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

const TIPO_MIDIA_PARA_GRAPH: Record<string, "image" | "document" | "audio"> = {
  imagem: "image",
  documento: "document",
  audio: "audio",
};

export async function POST(request: Request) {
  // Sem isso, qualquer um na internet mandava mensagem de WhatsApp pros
  // clientes pelo número oficial da empresa. O gcId (quem envia) vem sempre
  // da sessão real — nunca do corpo, pra não dar pra se passar por outro GC.
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  const gcId = sessao.gc.id;

  try {
    const { conversaId, texto, template, midia, nota } = await request.json();
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
    const numeroAtivo = (await admin.from("whatsapp_numeros").select("phone_number_id").eq("ativo", true).maybeSingle())
      .data;
    const phoneNumberIdOverride = numeroAtivo?.phone_number_id;

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

    // Não bloqueamos mais aqui pela janela de 24h — a Meta segue aplicando a
    // regra dela do lado de lá independente disso: fora da janela, o envio de
    // texto/mídia livre volta com erro da própria Graph API (ex: "Re-engagement
    // message"), e esse erro é repassado pro chamador normalmente lá embaixo.
    const primeiroNome = gc?.nome ? gc.nome.trim().split(/\s+/)[0] : null;
    const assinatura = primeiroNome ? `*${primeiroNome}:*` : null;

    let resultado;
    let conteudo: string;
    let tipo: string;
    let midiaUrl: string | null = null;
    let midiaNome: string | null = null;

    if (midia) {
      const tipoGraph = TIPO_MIDIA_PARA_GRAPH[midia.tipo];
      if (!tipoGraph) return Response.json({ error: "Tipo de mídia inválido" }, { status: 400 });
      resultado = await enviarMidia(
        conversa.telefone,
        tipoGraph,
        midia.url,
        assinatura ?? undefined,
        midia.nome,
        phoneNumberIdOverride
      );
      tipo = midia.tipo;
      // Se o áudio gravado no navegador não for um formato aceito pela Meta (ela só aceita
      // aac/amr/mp3/mp4/ogg-opus, e o Chrome grava em webm), manda como documento pra não
      // perder a mensagem — o cliente ainda consegue abrir e ouvir o arquivo.
      if (!resultado.ok && tipoGraph === "audio") {
        resultado = await enviarMidia(
          conversa.telefone,
          "document",
          midia.url,
          assinatura ?? undefined,
          midia.nome,
          phoneNumberIdOverride
        );
        tipo = "documento";
      }
      conteudo = midia.nome ?? `[${midia.tipo}]`;
      midiaUrl = midia.url;
      midiaNome = midia.nome ?? null;
    } else if (template) {
      resultado = await enviarTemplate(
        conversa.telefone,
        template.nome,
        template.idioma,
        template.parametros ?? [],
        phoneNumberIdOverride
      );
      conteudo = `[template] ${template.nome}`;
      tipo = "template";
    } else {
      const textoFinal = assinatura ? `${assinatura}\n${texto}` : texto;
      resultado = await enviarTexto(conversa.telefone, textoFinal, phoneNumberIdOverride);
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
