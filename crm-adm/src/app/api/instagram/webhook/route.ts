import { createAdminClient } from "@/lib/supabase-admin";
import { buscarPerfil } from "@/lib/instagram-api";
import { assinaturaMetaValida } from "@/lib/meta-webhook";

export const dynamic = "force-dynamic";

// 1) Verificação do webhook (a Meta chama isso uma vez ao salvar a URL de callback)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function encontrarOuCriarConversa(admin: ReturnType<typeof createAdminClient>, igsid: string) {
  const { data: existente } = await admin.from("instagram_conversas").select("*").eq("instagram_scoped_id", igsid).maybeSingle();
  if (existente) return existente;

  const perfil = await buscarPerfil(igsid);

  // tenta casar com uma empresa cadastrada pelo @usuário do Instagram
  let empresaId: string | null = null;
  if (perfil.username) {
    const { data: empresa } = await admin
      .from("empresas")
      .select("id")
      .ilike("instagram_usuario", perfil.username)
      .maybeSingle();
    empresaId = empresa?.id ?? null;
  }

  const { data: nova } = await admin
    .from("instagram_conversas")
    .insert({ instagram_scoped_id: igsid, username: perfil.username, nome_perfil: perfil.nome, empresa_id: empresaId })
    .select("*")
    .single();

  return nova;
}

interface AnexoRecebido {
  type: string;
  payload?: { url?: string };
}

interface MensagemRecebida {
  mid: string;
  text?: string;
  attachments?: AnexoRecebido[];
  is_echo?: boolean;
}

interface ItemMessaging {
  sender: { id: string };
  recipient: { id: string };
  message?: MensagemRecebida;
  read?: { mid: string };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!assinaturaMetaValida(rawBody, request.headers.get("x-hub-signature-256"), process.env.INSTAGRAM_APP_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const payload = JSON.parse(rawBody);
    if (payload?.object !== "instagram") return Response.json({ ok: true });

    const admin = createAdminClient();
    const entradas = payload?.entry ?? [];

    for (const entrada of entradas) {
      const eventos: ItemMessaging[] = entrada.messaging ?? [];

      for (const evento of eventos) {
        // eco da própria mensagem que a gente mandou (já foi gravada no /api/instagram/enviar)
        if (evento.message?.is_echo) continue;

        if (evento.message) {
          const conversa = await encontrarOuCriarConversa(admin, evento.sender.id);
          if (!conversa) continue;

          const anexo = evento.message.attachments?.[0];
          const tipoPorAnexo: Record<string, string> = { image: "imagem", video: "video", audio: "audio" };
          const tipo = anexo ? tipoPorAnexo[anexo.type] ?? "midia" : "texto";
          const conteudo = evento.message.text ?? (anexo ? `[${tipo}]` : "");

          await admin.from("instagram_mensagens").insert({
            conversa_id: conversa.id,
            direcao: "recebida",
            conteudo,
            tipo,
            midia_url: anexo?.payload?.url ?? null,
            instagram_message_id: evento.message.mid,
            status_entrega: "entregue",
          });

          await admin
            .from("instagram_conversas")
            .update({ ultima_mensagem_em: new Date().toISOString(), nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
            .eq("id", conversa.id);

          if (conversa.empresa_id) {
            await admin.from("atividades").insert({
              empresa_id: conversa.empresa_id,
              tipo_atividade: "Nova mensagem no Instagram",
              status: "Pendente",
              prazo: new Date().toISOString().slice(0, 10),
              alerta_disparado: true,
            });
          }
        }

        if (evento.read) {
          const { data: mensagemLida } = await admin
            .from("instagram_mensagens")
            .select("conversa_id, criado_em")
            .eq("instagram_message_id", evento.read.mid)
            .maybeSingle();

          if (mensagemLida) {
            await admin
              .from("instagram_mensagens")
              .update({ status_entrega: "lido" })
              .eq("conversa_id", mensagemLida.conversa_id)
              .eq("direcao", "enviada")
              .lte("criado_em", mensagemLida.criado_em);
          }
        }
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    // Sempre responde 200 pra Meta não ficar reenviando o mesmo evento;
    // o erro real fica só nos logs do servidor.
    console.error("Erro no webhook do Instagram:", e);
    return Response.json({ ok: true });
  }
}
