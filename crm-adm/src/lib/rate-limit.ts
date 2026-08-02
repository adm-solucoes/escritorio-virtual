import { createAdminClient } from "@/lib/supabase-admin";

/** Janela padrão de todas as políticas. 15 min é o intervalo pedido na
 * auditoria e é longo o bastante pra frear força-bruta sem incomodar uso
 * normal. */
const JANELA_SEGUNDOS = 15 * 60;

export interface Politica {
  limite: number;
  janelaSegundos: number;
  /** Aparece na chave do contador — separa a cota por categoria, senão
   * um GET barato gastaria a mesma cota de um POST caro na mesma rota. */
  nome: string;
}

const AUTH: Politica = { nome: "auth", limite: 5, janelaSegundos: JANELA_SEGUNDOS };
const PUBLICO_ESCRITA: Politica = { nome: "publico-escrita", limite: 10, janelaSegundos: JANELA_SEGUNDOS };
const CUSTO_REAL: Politica = { nome: "custo-real", limite: 20, janelaSegundos: JANELA_SEGUNDOS };
const WEBHOOK: Politica = { nome: "webhook", limite: 600, janelaSegundos: JANELA_SEGUNDOS };
/** Envio de mensagem é o trabalho diário do time — num atendimento movimentado
 * 20 em 15 min se atinge fácil e o limite viraria bug pro usuário, não
 * proteção. Fica mais alto que a escrita genérica de propósito. */
const MENSAGERIA: Politica = { nome: "mensageria", limite: 60, janelaSegundos: JANELA_SEGUNDOS };
const ESCRITA: Politica = { nome: "escrita", limite: 20, janelaSegundos: JANELA_SEGUNDOS };
const LEITURA: Politica = { nome: "leitura", limite: 100, janelaSegundos: JANELA_SEGUNDOS };

/** Rotas com limite próprio. A ordem importa: a primeira que casar vence,
 * então o específico vem antes do genérico. O que não casar aqui cai no
 * padrão por método (escrita/leitura). */
const ROTAS_ESPECIAIS: { prefixo: string; politica: Politica }[] = [
  // Disparam e-mail — sem limite viram vetor de email bombing (e conta da Resend).
  { prefixo: "/api/auth/esqueci-senha", politica: AUTH },
  { prefixo: "/api/membros/convidar", politica: AUTH },

  // Pública de verdade: qualquer um com a chave do formulário escreve no banco.
  { prefixo: "/api/leads/capturar", politica: PUBLICO_ESCRITA },

  // Cada chamada gasta dinheiro real (tokens Anthropic, ligação Twilio,
  // crédito da Casa dos Dados). Aqui o limite é proteção de custo, não só de abuso.
  { prefixo: "/api/assistente/perguntar", politica: CUSTO_REAL },
  { prefixo: "/api/acao-rapida/parse-ia", politica: CUSTO_REAL },
  { prefixo: "/api/automacoes/sugestoes", politica: CUSTO_REAL },
  { prefixo: "/api/agente-voz/ligar", politica: CUSTO_REAL },
  { prefixo: "/api/leads/importar-casa-dos-dados", politica: CUSTO_REAL },

  // Webhooks externos: teto alto porque a Meta manda rajada legítima quando
  // chegam várias mensagens juntas. O limite existe só como freio de abuso —
  // apertar aqui significaria descartar mensagem real de cliente.
  { prefixo: "/api/whatsapp/webhook", politica: WEBHOOK },
  { prefixo: "/api/instagram/webhook", politica: WEBHOOK },
  { prefixo: "/api/agente-voz/resultado", politica: WEBHOOK },

  // Atendimento do dia a dia — ver comentário da política MENSAGERIA.
  { prefixo: "/api/whatsapp/enviar", politica: MENSAGERIA },
  { prefixo: "/api/instagram/enviar", politica: MENSAGERIA },
];

export function politicaPara(pathname: string, metodo: string): Politica {
  const especial = ROTAS_ESPECIAIS.find((r) => pathname.startsWith(r.prefixo));
  if (especial) return especial.politica;
  return metodo === "GET" || metodo === "HEAD" ? LEITURA : ESCRITA;
}

/**
 * Identificador estável da rota pro balde de cota.
 *
 * Não dá pra usar o pathname cru: numa rota dinâmica como
 * /api/calendario/eventos/<id>, cada id viraria um balde novo e zerado — ou
 * seja, bastaria variar o id pra ignorar o limite por completo. Agrupar
 * pelos 3 primeiros segmentos (/api/calendario/eventos) fecha esse buraco e
 * ainda mantém orçamentos separados por funcionalidade.
 */
export function grupoDaRota(pathname: string): string {
  const especial = ROTAS_ESPECIAIS.find((r) => pathname.startsWith(r.prefixo));
  if (especial) return especial.prefixo;
  return "/" + pathname.split("/").filter(Boolean).slice(0, 3).join("/");
}

/** IP de origem. Na Vercel o cliente real é o primeiro item de
 * x-forwarded-for (os seguintes são proxies). Fora dela pode não existir —
 * daí o "desconhecido", que faz todo mundo sem IP dividir a mesma cota
 * (conservador de propósito: prefiro limitar demais a não limitar nada). */
export function ipDaRequisicao(headers: Headers): string {
  const encaminhado = headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "desconhecido";
}

/** Chamada agendada da própria Vercel (vercel.json). Isenta de limite: vem
 * sempre do mesmo punhado de IPs e num horário fixo, então cairia no teto
 * por motivo errado. Só isenta com o segredo correto — sem ele, é tratada
 * como requisição comum e entra no limite normal. */
export function ehCronAutorizado(headers: Headers): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return headers.get("authorization") === `Bearer ${segredo}`;
}

export interface ResultadoLimite {
  permitido: boolean;
  restante: number;
  resetEm: Date;
}

/**
 * Consome 1 unidade da cota de `identificador` na política dada.
 *
 * Falha ABERTA de propósito: se o banco estiver fora do ar, liberar a
 * requisição é melhor que derrubar o CRM inteiro — o limitador é uma
 * proteção secundária, não pode virar ponto único de falha. O erro vai pro
 * log pra não passar despercebido.
 */
export async function consumirCota(identificador: string, politica: Politica): Promise<ResultadoLimite> {
  const chave = `${politica.nome}:${identificador}`;
  const agora = Date.now();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("consumir_rate_limit", {
      p_chave: chave,
      p_limite: politica.limite,
      p_janela_segundos: politica.janelaSegundos,
    });

    if (error) throw new Error(error.message);

    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) throw new Error("consumir_rate_limit não devolveu linha");

    return {
      permitido: linha.permitido,
      restante: linha.restante ?? 0,
      resetEm: new Date(linha.reset_em),
    };
  } catch (err) {
    console.error(
      `[rate-limit] falha ao consultar a cota de "${chave}" — liberando a requisição:`,
      err instanceof Error ? err.message : err
    );
    return { permitido: true, restante: politica.limite, resetEm: new Date(agora + politica.janelaSegundos * 1000) };
  }
}

/** 429 padrão, com Retry-After em segundos (formato que a spec de HTTP
 * espera e que clientes/bibliotecas sabem respeitar sozinhos). */
export function respostaLimiteExcedido(resultado: ResultadoLimite): Response {
  const segundos = Math.max(1, Math.ceil((resultado.resetEm.getTime() - Date.now()) / 1000));
  return Response.json(
    { error: "Muitas requisições. Tente de novo daqui a pouco." },
    {
      status: 429,
      headers: {
        "Retry-After": String(segundos),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resultado.resetEm.toISOString(),
      },
    }
  );
}

/** Limite extra por identificador de usuário (e-mail), somado ao limite por
 * IP que o proxy já aplicou. Usado nas rotas de auth: sem isso, um atacante
 * numa botnet (cada request de um IP diferente) passaria batido no limite
 * por IP e ainda assim martelaria a mesma conta. */
export async function limitarPorIdentificador(identificador: string): Promise<ResultadoLimite> {
  return consumirCota(`id:${identificador.toLowerCase().trim()}`, AUTH);
}
