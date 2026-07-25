// Wrapper server-only para a WhatsApp Cloud API (Meta Graph API).
// Nunca importar este arquivo em componentes de cliente — usa o token secreto.

const GRAPH_VERSION = "v22.0";

function graphUrl(path: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

function headers() {
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) throw new Error("WHATSAPP_API_TOKEN não configurado");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function phoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado");
  return id;
}

interface RespostaEnvio {
  ok: boolean;
  messageId?: string;
  error?: string;
}

async function chamarGraphApi(body: Record<string, unknown>, phoneNumberIdOverride?: string): Promise<RespostaEnvio> {
  try {
    const res = await fetch(graphUrl(`${phoneNumberIdOverride ?? phoneNumberId()}/messages`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Erro desconhecido da Meta" };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Envia texto livre — só funciona dentro da janela de 24h após a última mensagem do cliente. */
export async function enviarTexto(paraTelefone: string, texto: string, phoneNumberIdOverride?: string): Promise<RespostaEnvio> {
  return chamarGraphApi(
    {
      to: paraTelefone,
      type: "text",
      text: { body: texto, preview_url: false },
    },
    phoneNumberIdOverride
  );
}

/** Envia um template pré-aprovado — funciona a qualquer momento, mesmo fora da janela de 24h. */
export async function enviarTemplate(
  paraTelefone: string,
  nomeTemplate: string,
  idioma: string,
  parametros: string[] = [],
  phoneNumberIdOverride?: string
): Promise<RespostaEnvio> {
  return chamarGraphApi(
    {
      to: paraTelefone,
      type: "template",
      template: {
        name: nomeTemplate,
        language: { code: idioma },
        ...(parametros.length > 0
          ? { components: [{ type: "body", parameters: parametros.map((texto) => ({ type: "text", text: texto })) }] }
          : {}),
      },
    },
    phoneNumberIdOverride
  );
}

/** Envia uma imagem, documento ou áudio a partir de uma URL pública (ex: Supabase Storage). */
export async function enviarMidia(
  paraTelefone: string,
  tipo: "image" | "document" | "audio",
  link: string,
  legenda?: string,
  nomeArquivo?: string,
  phoneNumberIdOverride?: string
): Promise<RespostaEnvio> {
  const corpo: Record<string, unknown> = { to: paraTelefone, type: tipo };
  if (tipo === "document") {
    corpo.document = { link, ...(legenda ? { caption: legenda } : {}), ...(nomeArquivo ? { filename: nomeArquivo } : {}) };
  } else if (tipo === "image") {
    corpo.image = { link, ...(legenda ? { caption: legenda } : {}) };
  } else {
    corpo.audio = { link };
  }
  return chamarGraphApi(corpo, phoneNumberIdOverride);
}

/** Marca uma mensagem recebida como lida (check azul do lado do cliente). */
export async function marcarComoLida(messageId: string): Promise<RespostaEnvio> {
  try {
    const res = await fetch(graphUrl(`${phoneNumberId()}/messages`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Erro desconhecido da Meta" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

function wabaId() {
  const id = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!id) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID não configurado");
  return id;
}

interface RespostaGenerica {
  ok: boolean;
  error?: string;
}

/** Cadastra um novo número de telefone na conta do WhatsApp Business e já pede o código de verificação. */
export async function adicionarNumero(
  cc: string,
  numeroLocal: string,
  nomeExibicao: string
): Promise<{ ok: boolean; phoneNumberId?: string; error?: string }> {
  try {
    const res = await fetch(graphUrl(`${wabaId()}/phone_numbers`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ cc, phone_number: numeroLocal, verified_name: nomeExibicao }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? "Erro ao adicionar número" };
    return { ok: true, phoneNumberId: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Solicita o código de verificação (SMS ou ligação) pra um número recém-adicionado. */
export async function solicitarCodigo(phoneNumberId: string, metodo: "SMS" | "VOICE" = "SMS"): Promise<RespostaGenerica> {
  try {
    const res = await fetch(graphUrl(`${phoneNumberId}/request_code`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ code_method: metodo, language: "pt_BR" }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? "Erro ao solicitar código" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Confirma o código recebido por SMS/ligação pra ativar o número. */
export async function verificarCodigo(phoneNumberId: string, codigo: string): Promise<RespostaGenerica> {
  try {
    const res = await fetch(graphUrl(`${phoneNumberId}/verify_code`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ code: codigo }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? "Código inválido" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Lista os templates de mensagem aprovados na conta (pra oferecer no seletor). */
export async function listarTemplates(): Promise<{ name: string; language: string; status: string }[]> {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!wabaId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID não configurado");
  const res = await fetch(graphUrl(`${wabaId}/message_templates?fields=name,language,status&limit=100`), {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) return [];
  return (data.data ?? []).filter((t: { status: string }) => t.status === "APPROVED");
}
