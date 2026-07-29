// Camada de IA usada pelo motor de automações — geração de mensagem (WhatsApp/e-mail),
// condição em linguagem natural e resumo interno com próxima ação sugerida.
// Toda chamada de modelo passa por chamarClaude() (lib/ai.ts), nunca direto no SDK.

import { chamarClaude, parseJsonIA } from "./ai";
import type { createAdminClient } from "./supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface AlvoContexto {
  empresaId: string | null;
  oportunidadeId: string | null;
  nomeEmpresa: string | null;
}

// Monta um resumo textual compacto do histórico da empresa/oportunidade (dados
// cadastrais, últimas mensagens de WhatsApp/Instagram, atividades recentes) pra
// dar contexto real à IA — sem isso, ela só teria o nome da empresa pra trabalhar.
async function montarContexto(admin: AdminClient, alvo: AlvoContexto): Promise<string> {
  const partes: string[] = [];

  if (alvo.empresaId) {
    const { data: empresa } = await admin
      .from("empresas")
      .select("nome_empresa, segmento, icp, temperatura, origem_lead, nome_contato")
      .eq("id", alvo.empresaId)
      .maybeSingle();
    if (empresa) {
      partes.push(
        `Empresa: ${empresa.nome_empresa}${empresa.segmento ? ` (${empresa.segmento})` : ""} — ICP ${empresa.icp ?? "?"}, temperatura ${empresa.temperatura ?? "?"}, contato: ${empresa.nome_contato ?? "não informado"}.`
      );
    }
  }

  if (alvo.oportunidadeId) {
    const { data: oportunidade } = await admin
      .from("oportunidades")
      .select("projeto, etapa_atual, valor_estimado, ultima_interacao, proxima_acao, observacoes")
      .eq("id", alvo.oportunidadeId)
      .maybeSingle();
    if (oportunidade) {
      partes.push(
        `Oportunidade "${oportunidade.projeto ?? "sem nome"}" na etapa ${oportunidade.etapa_atual}, valor estimado ${oportunidade.valor_estimado ?? "não informado"}, última interação em ${oportunidade.ultima_interacao ?? "desconhecida"}.${oportunidade.proxima_acao ? ` Próxima ação combinada: ${oportunidade.proxima_acao}.` : ""}${oportunidade.observacoes ? ` Observações: ${oportunidade.observacoes}` : ""}`
      );
    }
  }

  if (alvo.empresaId) {
    const [{ data: conversaWpp }, { data: conversaInsta }] = await Promise.all([
      admin.from("whatsapp_conversas").select("id").eq("empresa_id", alvo.empresaId).maybeSingle(),
      admin.from("instagram_conversas").select("id").eq("empresa_id", alvo.empresaId).maybeSingle(),
    ]);

    const [wppMsgs, instaMsgs] = await Promise.all([
      conversaWpp
        ? admin
            .from("whatsapp_mensagens")
            .select("direcao, conteudo, criado_em")
            .eq("conversa_id", conversaWpp.id)
            .eq("interna", false)
            .order("criado_em", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: null }),
      conversaInsta
        ? admin
            .from("instagram_mensagens")
            .select("direcao, conteudo, criado_em")
            .eq("conversa_id", conversaInsta.id)
            .eq("interna", false)
            .order("criado_em", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: null }),
    ]);

    const mensagens = [...(wppMsgs.data ?? []), ...(instaMsgs.data ?? [])]
      .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
      .map((m) => `${m.direcao === "enviada" ? "ADM" : "Cliente"}: ${m.conteudo}`.slice(0, 300));

    if (mensagens.length) {
      partes.push(`Últimas mensagens trocadas:\n${mensagens.join("\n")}`);
    }
  }

  return partes.length ? partes.join("\n\n") : "Sem histórico adicional disponível pra essa empresa.";
}

const SYSTEM_WHATSAPP = `Você redige mensagens de WhatsApp em português do Brasil pra ADM Soluções, uma empresa de consultoria/gestão comercial. Tom direto, cordial, profissional — sem parecer robô, sem exagero de emoji (no máximo 1). Mensagem curta (2-4 frases), pronta pra enviar, sem saudação genérica tipo "Prezado(a)". Nunca invente fatos que não estão no contexto fornecido (valores, prazos, promessas). Responda só com o texto da mensagem, nada mais.`;

export async function gerarMensagemWhatsappIA(
  admin: AdminClient,
  instrucao: string,
  alvo: AlvoContexto
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const contexto = await montarContexto(admin, alvo);
  const resultado = await chamarClaude({
    tarefa: "redigir",
    origem: "automacao",
    system: SYSTEM_WHATSAPP,
    mensagem: `Instrução: ${instrucao}\n\nContexto:\n${contexto}`,
    maxTokens: 400,
  });
  return resultado.ok ? { ok: true, texto: resultado.texto } : { ok: false, erro: resultado.erro };
}

const SCHEMA_EMAIL = {
  type: "object" as const,
  properties: {
    assunto: { type: "string" as const },
    corpoHtml: { type: "string" as const },
  },
  required: ["assunto", "corpoHtml"],
  additionalProperties: false,
};

interface EmailIA {
  assunto: string;
  corpoHtml: string;
}

const SYSTEM_EMAIL = `Você redige e-mails comerciais em português do Brasil pra ADM Soluções. Tom profissional e cordial. O corpo deve ser HTML simples (parágrafos <p>, sem CSS inline elaborado, sem tabelas). Nunca invente fatos que não estão no contexto fornecido. Gere um assunto curto e direto e o corpo do e-mail.`;

export async function gerarEmailIA(
  admin: AdminClient,
  instrucao: string,
  alvo: AlvoContexto
): Promise<{ ok: true; assunto: string; corpoHtml: string } | { ok: false; erro: string }> {
  const contexto = await montarContexto(admin, alvo);
  const resultado = await chamarClaude({
    tarefa: "redigir",
    origem: "automacao",
    system: SYSTEM_EMAIL,
    mensagem: `Instrução: ${instrucao}\n\nContexto:\n${contexto}`,
    maxTokens: 600,
    outputSchema: SCHEMA_EMAIL,
  });
  const dados = parseJsonIA<EmailIA>(resultado);
  if (!dados) return { ok: false, erro: !resultado.ok ? resultado.erro : "A IA não retornou um e-mail válido." };
  return { ok: true, assunto: dados.assunto, corpoHtml: dados.corpoHtml };
}

const SCHEMA_CONDICAO = {
  type: "object" as const,
  properties: {
    resultado: { type: "boolean" as const },
    motivo: { type: "string" as const },
  },
  required: ["resultado", "motivo"],
  additionalProperties: false,
};

interface CondicaoIA {
  resultado: boolean;
  motivo: string;
}

const SYSTEM_CONDICAO = `Você avalia uma pergunta de sim/não sobre uma empresa/oportunidade de vendas, com base só no contexto fornecido. Se não houver informação suficiente pra responder com confiança, responda "resultado": false e explique no motivo. Seja conservador — só responda "true" quando o contexto sustentar claramente.`;

/** Usada pelo nó de condição quando campo === "ia" — avalia uma pergunta em linguagem
 * natural (ex: "empresa parece insatisfeita?") em vez de comparar um campo fixo. */
export async function avaliarCondicaoIA(admin: AdminClient, pergunta: string, alvo: AlvoContexto): Promise<boolean> {
  const contexto = await montarContexto(admin, alvo);
  const resultado = await chamarClaude({
    tarefa: "extrair",
    origem: "automacao",
    system: SYSTEM_CONDICAO,
    mensagem: `Pergunta: ${pergunta}\n\nContexto:\n${contexto}`,
    maxTokens: 300,
    outputSchema: SCHEMA_CONDICAO,
  });
  const dados = parseJsonIA<CondicaoIA>(resultado);
  return dados?.resultado ?? false;
}

const SCHEMA_RESUMO = {
  type: "object" as const,
  properties: {
    resumo: { type: "string" as const },
    proximaAcao: { type: "string" as const },
  },
  required: ["resumo", "proximaAcao"],
  additionalProperties: false,
};

interface ResumoIA {
  resumo: string;
  proximaAcao: string;
}

const SYSTEM_RESUMO = `Você é um assistente interno de vendas. A partir do contexto de uma empresa/oportunidade (dados cadastrais, últimas mensagens), escreva um resumo curto (2-3 frases) da situação atual e sugira uma próxima ação concreta pro time comercial (1 frase, específica e acionável). Nunca invente fatos que não estão no contexto.`;

/** Usada pelo nó "acao_resumir_ia" — só fala com o time interno, nunca com o cliente,
 * por isso não passa pela fila de revisão (diferente de WhatsApp/e-mail gerados por IA). */
export async function gerarResumoIA(
  admin: AdminClient,
  alvo: AlvoContexto
): Promise<{ ok: true; resumo: string; proximaAcao: string } | { ok: false; erro: string }> {
  const contexto = await montarContexto(admin, alvo);
  const resultado = await chamarClaude({
    tarefa: "redigir",
    origem: "automacao",
    system: SYSTEM_RESUMO,
    mensagem: `Contexto:\n${contexto}`,
    maxTokens: 400,
    outputSchema: SCHEMA_RESUMO,
    effort: "low",
  });
  const dados = parseJsonIA<ResumoIA>(resultado);
  if (!dados) return { ok: false, erro: !resultado.ok ? resultado.erro : "A IA não retornou um resumo válido." };
  return { ok: true, resumo: dados.resumo, proximaAcao: dados.proximaAcao };
}
