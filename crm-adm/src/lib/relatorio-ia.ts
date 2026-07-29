// Resumo executivo em texto pro topo do e-mail de relatório. Usa Haiku (tarefa
// "extrair") em vez de Sonnet — é um resumo curto e objetivo a partir de números
// já calculados, não precisa da qualidade redacional do "redigir", e sai mais
// barato/rápido rodando todo dia. Se a IA falhar, o e-mail sai normal sem essa
// seção — nunca trava o envio do relatório por causa disso.

import { chamarClaude } from "./ai";

export interface DadosResumoIA {
  valorPipeline: number;
  receitaFechada: number;
  taxaConversao: number;
  atividadesAtrasadas: number;
  renovacoesProximas: number;
  oportunidadesParadas: number;
  maiorOportunidadeAberta: { nome: string; valor: number } | null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SYSTEM = `Você escreve o resumo executivo de abertura de um relatório comercial diário em português do Brasil, pra ADM Soluções. 2-3 frases, direto ao ponto, tom profissional (nem informal demais, nem robótico). Destaque o que está bem e o que precisa de atenção — não repita todos os números, escolha o que for mais relevante. Nunca invente fatos além dos números fornecidos. Responda só com o texto do resumo, sem saudação, sem título.`;

export async function gerarResumoRelatorioIA(dados: DadosResumoIA): Promise<string | null> {
  const mensagem = `Pipeline aberto: ${moeda(dados.valorPipeline)}
Receita fechada no mês: ${moeda(dados.receitaFechada)}
Taxa de conversão: ${dados.taxaConversao.toFixed(0)}%
Atividades atrasadas: ${dados.atividadesAtrasadas}
Renovações se aproximando (30 dias): ${dados.renovacoesProximas}
Oportunidades sem contato há mais de 15 dias: ${dados.oportunidadesParadas}
${dados.maiorOportunidadeAberta ? `Maior oportunidade em aberto: ${dados.maiorOportunidadeAberta.nome} (${moeda(dados.maiorOportunidadeAberta.valor)})` : ""}`;

  const resultado = await chamarClaude({
    tarefa: "extrair",
    origem: "relatorio",
    system: SYSTEM,
    mensagem,
    maxTokens: 250,
  });

  return resultado.ok ? resultado.texto : null;
}
