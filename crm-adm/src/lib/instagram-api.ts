// Wrapper server-only para a Instagram Messaging API (Meta Graph API).
// Nunca importar este arquivo em componentes de cliente — usa o token secreto.
//
// Diferente do WhatsApp, aqui não existe "template" pra reabrir conversa fora
// da janela de 24h — a Meta simplesmente recusa o envio nesse caso.

const GRAPH_VERSION = "v22.0";

function graphUrl(path: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

function accessToken() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado");
  return token;
}

function contaId() {
  const id = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!id) throw new Error("INSTAGRAM_ACCOUNT_ID não configurado");
  return id;
}

interface RespostaEnvio {
  ok: boolean;
  messageId?: string;
  error?: string;
}

async function chamarGraphApi(body: Record<string, unknown>): Promise<RespostaEnvio> {
  try {
    const res = await fetch(graphUrl(`${contaId()}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken(), ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Erro desconhecido da Meta" };
    }
    return { ok: true, messageId: data?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Envia texto livre — só funciona dentro da janela de 24h após a última mensagem do contato. */
export async function enviarTexto(igsid: string, texto: string): Promise<RespostaEnvio> {
  return chamarGraphApi({
    recipient: { id: igsid },
    message: { text: texto },
  });
}

/** Envia imagem ou vídeo a partir de uma URL pública (ex: Supabase Storage). */
export async function enviarMidia(igsid: string, tipo: "image" | "video", link: string): Promise<RespostaEnvio> {
  return chamarGraphApi({
    recipient: { id: igsid },
    message: { attachment: { type: tipo, payload: { url: link, is_reusable: true } } },
  });
}

/** Marca a conversa como lida (visto) do lado do contato. */
export async function marcarComoLida(igsid: string): Promise<RespostaEnvio> {
  try {
    const res = await fetch(graphUrl(`${contaId()}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken(),
        recipient: { id: igsid },
        sender_action: "mark_seen",
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? "Erro desconhecido da Meta" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

/** Busca nome e username do perfil pelo IGSID — usado pra exibir na lista de conversas. */
export async function buscarPerfil(igsid: string): Promise<{ nome: string | null; username: string | null }> {
  try {
    const res = await fetch(graphUrl(`${igsid}?fields=name,username&access_token=${accessToken()}`));
    const data = await res.json();
    if (!res.ok) return { nome: null, username: null };
    return { nome: data?.name ?? null, username: data?.username ?? null };
  } catch {
    return { nome: null, username: null };
  }
}
