import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// 1) Verificação do webhook (a Meta chama isso uma vez ao salvar a URL de callback)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

function normalizarTelefone(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  // remove o "55" (Brasil) do início pra comparar só o DDD+número
  return digitos.startsWith("55") ? digitos.slice(2) : digitos;
}

async function encontrarOuCriarConversa(
  admin: ReturnType<typeof createAdminClient>,
  telefoneE164: string,
  nomePerfilWhatsapp?: string
) {
  const { data: existente } = await admin.from("whatsapp_conversas").select("*").eq("telefone", telefoneE164).maybeSingle();
  if (existente) {
    // atualiza o nome de perfil caso o cliente tenha mudado (ou ainda não tínhamos salvo)
    if (nomePerfilWhatsapp && existente.nome_perfil_whatsapp !== nomePerfilWhatsapp) {
      await admin.from("whatsapp_conversas").update({ nome_perfil_whatsapp: nomePerfilWhatsapp }).eq("id", existente.id);
      existente.nome_perfil_whatsapp = nomePerfilWhatsapp;
    }
    return existente;
  }

  // tenta casar com uma empresa cadastrada pelo telefone
  const { data: empresas } = await admin.from("empresas").select("id, telefone");
  const alvo = normalizarTelefone(telefoneE164);
  const empresa = (empresas ?? []).find((e) => {
    if (!e.telefone) return false;
    return e.telefone
      .split("/")
      .some((parte: string) => {
        const normalizado = normalizarTelefone(parte);
        return normalizado.length >= 8 && (normalizado.endsWith(alvo.slice(-8)) || alvo.endsWith(normalizado.slice(-8)));
      });
  });

  const { data: nova } = await admin
    .from("whatsapp_conversas")
    .insert({ telefone: telefoneE164, empresa_id: empresa?.id ?? null, nome_perfil_whatsapp: nomePerfilWhatsapp ?? null })
    .select("*")
    .single();

  return nova;
}

interface MensagemRecebida {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

interface StatusRecebido {
  id: string;
  status: string;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const admin = createAdminClient();

    const changes = payload?.entry?.[0]?.changes?.[0]?.value;
    if (!changes) return Response.json({ ok: true });

    const mensagens: MensagemRecebida[] = changes.messages ?? [];
    const statuses: StatusRecebido[] = changes.statuses ?? [];
    const contatos: { wa_id: string; profile?: { name?: string } }[] = changes.contacts ?? [];

    for (const msg of mensagens) {
      const nomePerfil = contatos.find((c) => c.wa_id === msg.from)?.profile?.name;
      const conversa = await encontrarOuCriarConversa(admin, msg.from, nomePerfil);
      if (!conversa) continue;

      const conteudo = msg.type === "text" ? (msg.text?.body ?? "") : `[${msg.type}]`;

      await admin.from("whatsapp_mensagens").insert({
        conversa_id: conversa.id,
        direcao: "recebida",
        conteudo,
        tipo: msg.type === "text" ? "texto" : "midia",
        whatsapp_message_id: msg.id,
        status_entrega: "entregue",
      });

      await admin
        .from("whatsapp_conversas")
        .update({ ultima_mensagem_em: new Date().toISOString(), nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
        .eq("id", conversa.id);

      if (conversa.empresa_id) {
        await admin.from("atividades").insert({
          empresa_id: conversa.empresa_id,
          tipo_atividade: "Nova mensagem no WhatsApp",
          status: "Pendente",
          prazo: new Date().toISOString().slice(0, 10),
          alerta_disparado: true,
        });
      }
    }

    const mapaStatus: Record<string, string> = {
      sent: "enviado",
      delivered: "entregue",
      read: "lido",
      failed: "falhou",
    };

    for (const status of statuses) {
      const statusMapeado = mapaStatus[status.status];
      if (!statusMapeado) continue;
      await admin.from("whatsapp_mensagens").update({ status_entrega: statusMapeado }).eq("whatsapp_message_id", status.id);
    }

    return Response.json({ ok: true });
  } catch (e) {
    // Sempre responde 200 pra Meta não ficar reenviando o mesmo evento;
    // o erro real fica só nos logs do servidor.
    console.error("Erro no webhook do WhatsApp:", e);
    return Response.json({ ok: true });
  }
}
