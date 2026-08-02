import { z } from "zod";

/** Teto de corpo JSON. Nenhuma rota recebe upload — mídia do WhatsApp/
 * Instagram e anexos vão direto do navegador pro Supabase Storage, sem
 * passar por API route. Então 1MB é folgado pra qualquer payload legítimo
 * daqui e ainda barra tentativa de estourar memória. */
const TAMANHO_MAXIMO_BYTES = 1024 * 1024;

export type ResultadoValidacao<T> = { ok: true; dados: T } | { ok: false; resposta: Response };

function erro(mensagem: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ error: mensagem, ...extra }, { status });
}

/**
 * Lê e valida o corpo JSON de uma requisição numa passada só:
 * Content-Type correto → tamanho dentro do teto → JSON parseável → schema.
 *
 * O 400 devolve os NOMES dos campos inválidos (isso é contrato público da
 * API, o cliente precisa saber o que corrigir), mas nunca o erro cru do zod
 * — que carrega estrutura interna, tipos esperados e caminho do schema.
 */
export async function lerCorpoValidado<T>(request: Request, schema: z.ZodType<T>): Promise<ResultadoValidacao<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, resposta: erro("Content-Type deve ser application/json.", 415) };
  }

  // Rejeição barata antes de ler o corpo, quando o cliente declara o tamanho.
  const declarado = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_BYTES) {
    return { ok: false, resposta: erro("Corpo da requisição grande demais.", 413) };
  }

  let texto: string;
  try {
    texto = await request.text();
  } catch {
    return { ok: false, resposta: erro("Não foi possível ler o corpo da requisição.", 400) };
  }

  // Confere o tamanho real também: content-length é informado pelo cliente
  // e pode vir mentiroso ou ausente (chunked).
  if (new TextEncoder().encode(texto).length > TAMANHO_MAXIMO_BYTES) {
    return { ok: false, resposta: erro("Corpo da requisição grande demais.", 413) };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, resposta: erro("Corpo da requisição inválido (esperado JSON).", 400) };
  }

  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    const campos = Object.keys(z.flattenError(resultado.error).fieldErrors);
    return {
      ok: false,
      resposta: erro("Dados inválidos.", 400, campos.length ? { campos } : undefined),
    };
  }

  return { ok: true, dados: resultado.data };
}

/**
 * Versão tolerante, pra webhook de terceiro (Meta/WhatsApp/Instagram, agente
 * de voz). Valida só o que a gente realmente consome e deixa passar o resto
 * do payload intacto.
 *
 * O motivo de não ser estrito aqui: se a Meta adicionar um campo novo ou
 * mudar um formato que não usamos, um 400 faria a gente DESCARTAR mensagem
 * real de cliente — e webhook descartado não volta. Divergência vira log,
 * não rejeição.
 */
export async function lerWebhookValidado<T>(
  request: Request,
  schema: z.ZodType<T>,
  origem: string
): Promise<ResultadoValidacao<T>> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(await request.text());
  } catch {
    return { ok: false, resposta: erro("Corpo da requisição inválido (esperado JSON).", 400) };
  }

  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    console.error(
      `[webhook:${origem}] payload fora do formato esperado — ignorando este evento:`,
      JSON.stringify(z.flattenError(resultado.error).fieldErrors)
    );
    // 200 de propósito: um 4xx faria a Meta reenviar em loop o mesmo evento
    // que a gente já sabe que não consegue processar.
    return { ok: false, resposta: Response.json({ received: true }, { status: 200 }) };
  }

  return { ok: true, dados: resultado.data };
}

/* ---------- Schemas compartilhados ---------- */

/** Texto livre: apara espaço das pontas e limita tamanho. O limite é o que
 * de fato protege — impede que alguém grave megabytes num campo de nome.
 * Não escapo HTML aqui de propósito: o React já escapa na renderização, e
 * escapar na gravação corromperia o dado (viraria "&amp;" no banco). */
export const textoLivre = (max: number) => z.string().trim().max(max);

export const emailValido = z.email().max(254).transform((v) => v.toLowerCase().trim());

export const uuidValido = z.uuid();

/** E.164 — o formato que a Twilio e a Graph API do WhatsApp exigem. */
export const telefoneE164 = z
  .string()
  .trim()
  .regex(/^\+\d{8,15}$/, "Telefone deve estar em formato E.164 (ex: +5585999999999)");
