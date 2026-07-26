import type { Atividade, ConfiguracaoRelatorio, Empresa, Gc, Oportunidade, PipelineSnapshot } from "./types";
import {
  evolucaoPipeline,
  isGanha,
  isPerdida,
  relatorioMensal,
  relatorioPerdas,
  relatorioPorOrigem,
  relatorioPorResponsavel,
} from "./relatorios";

type SecoesRelatorio = Pick<
  ConfiguracaoRelatorio,
  "incluir_vendas" | "incluir_perdas" | "incluir_origem" | "incluir_responsavel" | "incluir_evolucao"
>;

const TODAS_SECOES: SecoesRelatorio = {
  incluir_vendas: true,
  incluir_perdas: true,
  incluir_origem: true,
  incluir_responsavel: true,
  incluir_evolucao: true,
};

// Meses mostrados nas séries temporais do e-mail — a tabela completa (desde o
// início do CRM) continua disponível na tela de Relatórios; no e-mail só o
// período recente importa, senão a tabela só cresce e vira ruído.
const MESES_RECENTES = 6;
const DIAS_ALERTA_RENOVACAO = 30;
const DIAS_ALERTA_SEM_CONTATO = 15;

const CORES = {
  navy: "#150638",
  navySuave: "rgba(21,6,56,0.6)",
  navyMuted: "rgba(21,6,56,0.45)",
  cream: "#fbf3e7",
  borda: "rgba(21,6,56,0.10)",
  fundoZebra: "rgba(21,6,56,0.025)",
  fundoCabecalho: "#150638",
  bom: "#0ca30c",
  ruim: "#c81e1e",
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

// ---------- Componentes de e-mail (tabelas aninhadas — a forma que renderiza
// de forma confiável em Gmail/Outlook/Apple Mail, sem depender de flexbox/grid) ----------

function tabela(colunas: string[], linhas: (string | number)[][], vazio = "Sem dados neste período.") {
  if (linhas.length === 0) {
    return `<p style="color:${CORES.navyMuted};font-size:13px;margin:0 0 8px;font-style:italic">${vazio}</p>`;
  }
  const th = colunas
    .map(
      (c, i) =>
        `<th style="text-align:${i === 0 ? "left" : "right"};padding:9px 12px;background:${CORES.fundoCabecalho};color:${CORES.cream};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.02em;${i === 0 ? "border-radius:8px 0 0 0" : ""}${i === colunas.length - 1 ? "border-radius:0 8px 0 0" : ""}">${c}</th>`
    )
    .join("");
  const rows = linhas
    .map(
      (linha, idx) =>
        `<tr style="background:${idx % 2 === 1 ? CORES.fundoZebra : "transparent"}">${linha
          .map(
            (v, i) =>
              `<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid ${CORES.borda};text-align:${i === 0 ? "left" : "right"};${
                i === 0 ? `font-weight:600;color:${CORES.navy}` : `color:${CORES.navySuave}`
              }">${v}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;border:1px solid ${CORES.borda};border-radius:8px;overflow:hidden"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

function listaAlerta(itens: string[], vazio: string) {
  if (itens.length === 0) {
    return `<p style="color:${CORES.bom};font-size:13px;margin:0 0 14px;font-weight:600">✓ ${vazio}</p>`;
  }
  return `<ul style="margin:0 0 14px;padding-left:18px">${itens
    .map((i) => `<li style="font-size:13px;color:${CORES.navySuave};margin-bottom:4px;line-height:1.4">${i}</li>`)
    .join("")}</ul>`;
}

function secao(icone: string, titulo: string, conteudoHtml: string) {
  return `
    <tr><td style="padding:0">
      <p style="font-size:14px;font-weight:800;color:${CORES.navy};margin:28px 0 10px;padding-bottom:8px;border-bottom:2px solid ${CORES.navy}">
        ${icone} ${titulo}
      </p>
      ${conteudoHtml}
    </td></tr>`;
}

// Setinha + % de variação ao lado do valor do cartão — bom/ruim decide a cor
// (nem sempre "subiu" é bom: usado só nos cartões onde subir é positivo).
function badgeDelta(deltaValor: number | null, unidade: "%" | "p.p." = "%"): string {
  if (deltaValor === null || !Number.isFinite(deltaValor) || Math.abs(deltaValor) < 0.5) return "";
  const bom = deltaValor >= 0;
  const cor = bom ? CORES.bom : CORES.ruim;
  const seta = deltaValor > 0 ? "▲" : "▼";
  return `<span style="color:${cor};font-size:11px;font-weight:700;margin-left:6px;white-space:nowrap">${seta} ${Math.abs(deltaValor).toFixed(0)}${unidade}</span>`;
}

// Cartão de destaque (bulletproof pra e-mail: uma célula de tabela com fundo
// sólido, sem depender de border-radius/flex — degrada bem no Outlook desktop).
function cartaoDestaque(label: string, valor: string, deltaHtml = "", destaque = false) {
  const bg = destaque ? CORES.navy : "#ffffff";
  const corLabel = destaque ? "rgba(251,243,231,0.65)" : CORES.navyMuted;
  const corValor = destaque ? CORES.cream : CORES.navy;
  return `
    <td style="padding:14px 16px;background:${bg};border:1px solid ${CORES.borda};border-radius:10px" width="25%">
      <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.02em;color:${corLabel}">${label}</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:${corValor}">${valor}${deltaHtml}</p>
    </td>`;
}

function deltaPct(atual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function diasEntre(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Resumo curto reaproveitado no assunto do e-mail — mesma conta usada no topo do relatório. */
export function calcularResumoRelatorio(oportunidades: Oportunidade[]) {
  const abertas = oportunidades.filter((o) => !isGanha(o) && !isPerdida(o));
  const ganhas = oportunidades.filter(isGanha);
  const valorPipeline = abertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  const receitaFechada = ganhas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  return { valorPipeline, receitaFechada };
}

// Soma o valor/qtd em aberto (todas as etapas exceto Perdido, comercial + CS)
// por dia, a partir dos snapshots diários — usado só pra comparar "hoje" com
// "~30 dias atrás" nos cartões do topo.
function serieDiariaPipelineAberto(snapshots: PipelineSnapshot[]) {
  const porDia = new Map<string, { valor: number; qtd: number }>();
  for (const s of snapshots) {
    if (s.etapa === "Perdido") continue;
    const atual = porDia.get(s.data) ?? { valor: 0, qtd: 0 };
    atual.valor += s.valor_total;
    atual.qtd += s.qtd;
    porDia.set(s.data, atual);
  }
  return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export interface DadosParaResumoIA {
  atividadesAtrasadas: number;
  renovacoesProximas: number;
  oportunidadesParadas: number;
  maiorOportunidadeAberta: { nome: string; valor: number } | null;
}

/** Calcula os alertas (usado tanto na seção "Pontos de atenção" quanto pra alimentar o resumo por IA). */
export function calcularAlertasRelatorio(empresas: Empresa[], oportunidades: Oportunidade[], atividadesAtrasadas: Atividade[]) {
  const nomePorEmpresa = new Map(empresas.map((e) => [e.id, e.nome_empresa]));
  const hoje = new Date();

  const renovacoes = oportunidades
    .filter((o) => o.data_renovacao)
    .map((o) => ({ o, dias: diasEntre(new Date(o.data_renovacao!), hoje) }))
    .filter(({ dias }) => dias >= 0 && dias <= DIAS_ALERTA_RENOVACAO)
    .sort((a, b) => a.dias - b.dias);

  const paradas = oportunidades
    .filter((o) => !isGanha(o) && !isPerdida(o) && o.ultima_interacao)
    .map((o) => ({ o, dias: diasEntre(hoje, new Date(o.ultima_interacao!)) }))
    .filter(({ dias }) => dias >= DIAS_ALERTA_SEM_CONTATO)
    .sort((a, b) => b.dias - a.dias);

  const maiorAberta = oportunidades
    .filter((o) => !isGanha(o) && !isPerdida(o) && o.valor_estimado)
    .sort((a, b) => (b.valor_estimado ?? 0) - (a.valor_estimado ?? 0))[0];

  return {
    atividadesAtrasadasItens: atividadesAtrasadas.map((a) => {
      const dias = a.prazo ? diasEntre(hoje, new Date(a.prazo)) : 0;
      const nome = a.empresas?.nome_empresa ?? (a.empresa_id ? nomePorEmpresa.get(a.empresa_id) : null) ?? "Empresa";
      return `<strong>${nome}</strong> — ${a.tipo_atividade} (${dias}d atrasada)`;
    }),
    renovacoesItens: renovacoes.slice(0, 5).map(({ o, dias }) => `<strong>${nomePorEmpresa.get(o.empresa_id) ?? "Empresa"}</strong> — ${o.projeto ?? "renovação"} (em ${dias}d)`),
    paradasItens: paradas.slice(0, 5).map(({ o, dias }) => `<strong>${nomePorEmpresa.get(o.empresa_id) ?? "Empresa"}</strong> — ${o.projeto ?? "sem projeto"} (${dias}d sem contato)`),
    dadosParaIA: {
      atividadesAtrasadas: atividadesAtrasadas.length,
      renovacoesProximas: renovacoes.length,
      oportunidadesParadas: paradas.length,
      maiorOportunidadeAberta: maiorAberta ? { nome: nomePorEmpresa.get(maiorAberta.empresa_id) ?? "Empresa", valor: maiorAberta.valor_estimado ?? 0 } : null,
    } satisfies DadosParaResumoIA,
  };
}

export interface OpcoesRelatorioHtml {
  empresas: Empresa[];
  oportunidades: Oportunidade[];
  gcs: Gc[];
  secoes?: SecoesRelatorio;
  snapshots?: PipelineSnapshot[];
  atividadesAtrasadas?: Atividade[];
  resumoIA?: string | null;
  siteUrl?: string;
}

export function montarRelatorioHtml(opcoes: OpcoesRelatorioHtml) {
  const {
    empresas,
    oportunidades,
    gcs,
    secoes = TODAS_SECOES,
    snapshots = [],
    atividadesAtrasadas = [],
    resumoIA = null,
    siteUrl = "",
  } = opcoes;

  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  // ---------- Resumo do topo (com comparativo vs ~30 dias atrás) ----------
  const abertas = oportunidades.filter((o) => !isGanha(o) && !isPerdida(o));
  const ganhas = oportunidades.filter(isGanha);
  const perdidasArr = oportunidades.filter(isPerdida);
  const { valorPipeline, receitaFechada } = calcularResumoRelatorio(oportunidades);
  const totalDecididas = ganhas.length + perdidasArr.length;
  const taxaConversao = totalDecididas ? (ganhas.length / totalDecididas) * 100 : 0;

  const serieAberto = serieDiariaPipelineAberto(snapshots);
  let deltaPipeline: number | null = null;
  let deltaQtdAtivas: number | null = null;
  if (serieAberto.length >= 2) {
    const [, ultimoValor] = serieAberto[serieAberto.length - 1];
    const alvo = new Date(hoje);
    alvo.setDate(alvo.getDate() - 30);
    const alvoISO = alvo.toISOString().slice(0, 10);
    const referencia = [...serieAberto].reverse().find(([data]) => data <= alvoISO) ?? serieAberto[0];
    deltaPipeline = deltaPct(ultimoValor.valor, referencia[1].valor);
    deltaQtdAtivas = deltaPct(ultimoValor.qtd, referencia[1].qtd);
  }

  const mensalParaComparativo = relatorioMensal(oportunidades);
  let deltaReceita: number | null = null;
  let deltaTaxaConversao: number | null = null;
  if (mensalParaComparativo.length >= 2) {
    const atual = mensalParaComparativo[mensalParaComparativo.length - 1];
    const anterior = mensalParaComparativo[mensalParaComparativo.length - 2];
    deltaReceita = deltaPct(atual.valorGanho, anterior.valorGanho || null);
    const taxaAtual = atual.qtdGanhas + atual.qtdPerdidas ? (atual.qtdGanhas / (atual.qtdGanhas + atual.qtdPerdidas)) * 100 : null;
    const taxaAnterior = anterior.qtdGanhas + anterior.qtdPerdidas ? (anterior.qtdGanhas / (anterior.qtdGanhas + anterior.qtdPerdidas)) * 100 : null;
    deltaTaxaConversao = taxaAtual !== null && taxaAnterior !== null ? taxaAtual - taxaAnterior : null;
  }

  const resumo = `
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:16px 0 8px">
      <tr>
        ${cartaoDestaque("Pipeline aberto", moedaCompacta(valorPipeline), badgeDelta(deltaPipeline))}
        ${cartaoDestaque("Receita fechada", moedaCompacta(receitaFechada), badgeDelta(deltaReceita), true)}
        ${cartaoDestaque("Taxa de conversão", `${taxaConversao.toFixed(0)}%`, badgeDelta(deltaTaxaConversao, "p.p."))}
        ${cartaoDestaque("Oportunidades ativas", String(abertas.length), badgeDelta(deltaQtdAtivas))}
      </tr>
    </table>
    <p style="font-size:10px;color:${CORES.navyMuted};margin:0 0 8px">Comparado a ~30 dias atrás</p>`;

  // ---------- Pontos de atenção ----------
  const alertas = calcularAlertasRelatorio(empresas, oportunidades, atividadesAtrasadas);
  const blocoAlertas = secao(
    "⚠️",
    "Pontos de atenção",
    `
      <p style="font-size:12px;font-weight:700;color:${CORES.navy};margin:0 0 4px">Atividades atrasadas</p>
      ${listaAlerta(alertas.atividadesAtrasadasItens, "Nenhuma atividade atrasada.")}
      <p style="font-size:12px;font-weight:700;color:${CORES.navy};margin:0 0 4px">Renovações se aproximando (${DIAS_ALERTA_RENOVACAO} dias)</p>
      ${listaAlerta(alertas.renovacoesItens, "Nenhuma renovação próxima.")}
      <p style="font-size:12px;font-weight:700;color:${CORES.navy};margin:0 0 4px">Sem contato há mais de ${DIAS_ALERTA_SEM_CONTATO} dias</p>
      ${listaAlerta(alertas.paradasItens, "Todo mundo com contato em dia.")}
    `
  );

  // ---------- Seções de dados ----------
  const blocos: string[] = [blocoAlertas];

  if (secoes.incluir_vendas) {
    const mensal = relatorioMensal(oportunidades).slice(-MESES_RECENTES);
    blocos.push(
      secao(
        "📈",
        `Vendas por mês (últimos ${MESES_RECENTES})`,
        tabela(
          ["Mês", "Ganhas", "Valor ganho", "Perdidas", "Valor perdido"],
          mensal.map((m) => [m.label, m.qtdGanhas, moeda(m.valorGanho), m.qtdPerdidas, moeda(m.valorPerdido)])
        )
      )
    );
  }

  if (secoes.incluir_perdas) {
    const perdas = relatorioPerdas(oportunidades);
    blocos.push(
      secao(
        "❌",
        "Perdas por motivo",
        tabela(
          ["Motivo", "Qtd", "Valor"],
          perdas.slice(0, 8).map((p) => [p.motivo, p.qtd, moeda(p.valor)]),
          "Nenhuma oportunidade perdida registrada."
        )
      )
    );
  }

  if (secoes.incluir_origem) {
    const origem = relatorioPorOrigem(empresas, oportunidades);
    blocos.push(
      secao(
        "🌐",
        "Origem dos leads",
        tabela(
          ["Origem", "Leads", "Oportunidades", "Valor ganho"],
          origem.slice(0, 10).map((o) => [o.origem, o.leads, o.oportunidades, moeda(o.valorGanho)])
        )
      )
    );
  }

  if (secoes.incluir_responsavel) {
    const responsavel = relatorioPorResponsavel(oportunidades, gcs);
    blocos.push(
      secao(
        "👤",
        "Desempenho por responsável",
        tabela(
          ["GC", "Em aberto", "Ganhas", "Perdidas", "Pipeline aberto", "Valor ganho", "Conversão"],
          responsavel.map((r) => [
            r.nome,
            r.abertas,
            r.ganhas,
            r.perdidas,
            moeda(r.valorPipeline),
            moeda(r.valorGanho),
            `${r.taxaConversao.toFixed(0)}%`,
          ])
        )
      )
    );
  }

  if (secoes.incluir_evolucao) {
    const evolucao = evolucaoPipeline(empresas, oportunidades).slice(-MESES_RECENTES);
    blocos.push(
      secao(
        "📊",
        `Evolução do pipeline (últimos ${MESES_RECENTES} meses)`,
        tabela(
          ["Mês", "Novas empresas", "Novas oportunidades"],
          evolucao.map((e) => [e.label, e.novasEmpresas, e.novasOportunidades])
        )
      )
    );
  }

  const botaoCrm = siteUrl
    ? `<table role="presentation" style="margin:24px 0 0"><tr><td style="background:${CORES.navy};border-radius:8px">
        <a href="${siteUrl}/dashboard" style="display:inline-block;padding:11px 20px;color:${CORES.cream};font-size:13px;font-weight:700;text-decoration:none">Ver dashboard completo no CRM →</a>
      </td></tr></table>`
    : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:20px;background:#f4f1ea">
    <table role="presentation" style="width:100%;border-collapse:collapse">
      <tr><td style="background:${CORES.navy};padding:20px 24px;border-radius:12px 12px 0 0">
        <table role="presentation" style="width:100%"><tr>
          <td>
            <p style="color:${CORES.cream};font-weight:800;font-size:17px;margin:0">ADM Soluções</p>
            <p style="color:rgba(251,243,231,0.7);font-size:12px;margin:2px 0 0">Relatório comercial</p>
          </td>
          <td style="text-align:right;vertical-align:top">
            <p style="color:rgba(251,243,231,0.7);font-size:12px;margin:0;text-transform:capitalize">${dataFormatada}</p>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#ffffff;padding:20px 24px 28px;border:1px solid ${CORES.borda};border-top:0;border-radius:0 0 12px 12px">
        ${
          resumoIA
            ? `<div style="background:${CORES.fundoZebra};border-left:3px solid ${CORES.navy};border-radius:6px;padding:12px 16px;margin:0 0 18px">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${CORES.navy}">${resumoIA}</p>
              </div>`
            : ""
        }

        ${resumo}

        <table role="presentation" style="width:100%;border-collapse:collapse">${blocos.join("\n")}</table>

        ${botaoCrm}

        <p style="font-size:11px;color:${CORES.navyMuted};margin:28px 0 0;padding-top:14px;border-top:1px solid ${CORES.borda}">
          Relatório automático do CRM ADM Soluções · gerado em ${dataFormatada}
        </p>
      </td></tr>
    </table>
  </div>`;
}
