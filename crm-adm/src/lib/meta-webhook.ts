import crypto from "node:crypto";

/**
 * Valida a assinatura X-Hub-Signature-256 que a Meta (WhatsApp/Instagram)
 * manda em todo POST de webhook — HMAC-SHA256 do corpo cru usando o App
 * Secret do app da Meta. Sem isso, qualquer um que descubra a URL do webhook
 * consegue forjar mensagens recebidas, criar atividades falsas e até
 * disparar reenvio de mídia (mensagem real pro cliente).
 *
 * Enquanto o segredo (`envSecret`) não estiver configurado, deixa passar mas
 * avisa no log — pra não derrubar o webhook em produção antes de você colar o
 * App Secret na Vercel. Assim que a variável existir, a checagem passa a
 * valer e requisição sem assinatura válida é recusada.
 *
 * Retorna `true` se pode processar, `false` se deve recusar (401).
 */
export function assinaturaMetaValida(rawBody: string, cabecalhoAssinatura: string | null, envSecret: string | undefined): boolean {
  if (!envSecret) {
    console.warn(
      "[meta-webhook] App Secret não configurado — webhook aceitando sem validar assinatura. Configure a variável de ambiente pra fechar isso."
    );
    return true;
  }

  if (!cabecalhoAssinatura || !cabecalhoAssinatura.startsWith("sha256=")) return false;

  const esperado = "sha256=" + crypto.createHmac("sha256", envSecret).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual exige buffers do mesmo tamanho.
  const a = Buffer.from(cabecalhoAssinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
