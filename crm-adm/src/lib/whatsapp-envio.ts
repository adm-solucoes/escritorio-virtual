// Envio de WhatsApp reutilizável do lado do servidor (motor de automações e Ação Rápida
// usam exatamente essa mesma função — nunca duplicar a lógica de janela de 24h/template).

import { createAdminClient } from "@/lib/supabase-admin";
import { enviarTemplate, enviarTexto } from "@/lib/whatsapp-api";
import { normalizarTelefoneE164 } from "@/lib/whatsapp";

type AdminClient = ReturnType<typeof createAdminClient>;

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

export interface ConfigEnvioWhatsapp {
  modo: "texto" | "template";
  texto?: string;
  templateNome?: string;
  templateIdioma?: string;
}

async function acharOuCriarConversaServidor(admin: AdminClient, empresaId: string | null, telefone: string) {
  const telefoneE164 = normalizarTelefoneE164(telefone);
  if (!telefoneE164) return { erro: "Telefone inválido" };

  const { data: existente } = await admin.from("whatsapp_conversas").select("*").eq("telefone", telefoneE164).maybeSingle();
  if (existente) return { conversa: existente };

  const { data: nova, error } = await admin
    .from("whatsapp_conversas")
    .insert({ telefone: telefoneE164, empresa_id: empresaId })
    .select("*")
    .single();
  if (error || !nova) return { erro: error?.message ?? "Erro ao criar conversa" };
  return { conversa: nova };
}

/** Envia texto/template pro telefone informado, respeitando a janela de 24h da Cloud API. */
export async function enviarWhatsappGenerico(
  telefone: string | null,
  empresaId: string | null,
  config: ConfigEnvioWhatsapp
): Promise<{ ok: boolean; erro?: string }> {
  if (!telefone) return { ok: false, erro: "Sem telefone cadastrado" };

  const admin = createAdminClient();
  const resultadoConversa = await acharOuCriarConversaServidor(admin, empresaId, telefone);
  if ("erro" in resultadoConversa) return { ok: false, erro: resultadoConversa.erro };
  const conversa = resultadoConversa.conversa;

  const { data: numeroAtivo } = await admin.from("whatsapp_numeros").select("phone_number_id").eq("ativo", true).maybeSingle();
  const phoneNumberIdOverride = numeroAtivo?.phone_number_id;

  const { data: ultimaRecebida } = await admin
    .from("whatsapp_mensagens")
    .select("criado_em")
    .eq("conversa_id", conversa.id)
    .eq("direcao", "recebida")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dentroDaJanela = ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < JANELA_24H_MS : false;

  const modo = config.modo === "template" ? "template" : "texto";
  if (modo === "texto" && !dentroDaJanela) {
    return { ok: false, erro: "Fora da janela de 24h — escolha um template aprovado." };
  }

  const resultado =
    modo === "template"
      ? await enviarTemplate(
          conversa.telefone,
          String(config.templateNome ?? ""),
          String(config.templateIdioma ?? "pt_BR"),
          [],
          phoneNumberIdOverride
        )
      : await enviarTexto(conversa.telefone, String(config.texto ?? ""), phoneNumberIdOverride);

  if (!resultado.ok) return { ok: false, erro: resultado.error };

  await admin.from("whatsapp_mensagens").insert({
    conversa_id: conversa.id,
    direcao: "enviada",
    conteudo: modo === "template" ? `[template] ${config.templateNome}` : String(config.texto ?? ""),
    tipo: modo,
    whatsapp_message_id: resultado.messageId,
    status_entrega: "enviado",
  });
  await admin.from("whatsapp_conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversa.id);

  return { ok: true };
}
