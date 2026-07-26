import type { ConfiguracaoRelatorio, Empresa, Gc, Oportunidade } from "./types";
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

function secao(icone: string, titulo: string, conteudoHtml: string) {
  return `
    <tr><td style="padding:0">
      <p style="font-size:14px;font-weight:800;color:${CORES.navy};margin:28px 0 10px;padding-bottom:8px;border-bottom:2px solid ${CORES.navy}">
        ${icone} ${titulo}
      </p>
      ${conteudoHtml}
    </td></tr>`;
}

// Cartão de destaque (bulletproof pra e-mail: uma célula de tabela com fundo
// sólido, sem depender de border-radius/flex — degrada bem no Outlook desktop).
function cartaoDestaque(label: string, valor: string, destaque = false) {
  const bg = destaque ? CORES.navy : "#ffffff";
  const corLabel = destaque ? "rgba(251,243,231,0.65)" : CORES.navyMuted;
  const corValor = destaque ? CORES.cream : CORES.navy;
  return `
    <td style="padding:14px 16px;background:${bg};border:1px solid ${CORES.borda};border-radius:10px" width="25%">
      <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.02em;color:${corLabel}">${label}</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:${corValor}">${valor}</p>
    </td>`;
}

/** Resumo curto reaproveitado no assunto do e-mail — mesma conta usada no topo do relatório. */
export function calcularResumoRelatorio(oportunidades: Oportunidade[]) {
  const abertas = oportunidades.filter((o) => !isGanha(o) && !isPerdida(o));
  const ganhas = oportunidades.filter(isGanha);
  const valorPipeline = abertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  const receitaFechada = ganhas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  return { valorPipeline, receitaFechada };
}

export function montarRelatorioHtml(
  empresas: Empresa[],
  oportunidades: Oportunidade[],
  gcs: Gc[],
  secoes: SecoesRelatorio = TODAS_SECOES
) {
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  // ---------- Resumo do topo ----------
  const abertas = oportunidades.filter((o) => !isGanha(o) && !isPerdida(o));
  const ganhas = oportunidades.filter(isGanha);
  const perdidasArr = oportunidades.filter(isPerdida);
  const { valorPipeline, receitaFechada } = calcularResumoRelatorio(oportunidades);
  const totalDecididas = ganhas.length + perdidasArr.length;
  const taxaConversao = totalDecididas ? (ganhas.length / totalDecididas) * 100 : 0;

  const resumo = `
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:16px 0 8px">
      <tr>
        ${cartaoDestaque("Pipeline aberto", moedaCompacta(valorPipeline))}
        ${cartaoDestaque("Receita fechada", moedaCompacta(receitaFechada), true)}
        ${cartaoDestaque("Taxa de conversão", `${taxaConversao.toFixed(0)}%`)}
        ${cartaoDestaque("Oportunidades ativas", String(abertas.length))}
      </tr>
    </table>`;

  // ---------- Seções ----------
  const blocos: string[] = [];

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

  const semSecoes = blocos.length === 0;

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
        ${resumo}

        ${
          semSecoes
            ? `<p style="color:${CORES.navyMuted};font-size:13px;margin-top:24px">Nenhuma seção selecionada nas configurações — ajuste em Configurações → Relatórios por e-mail.</p>`
            : `<table role="presentation" style="width:100%;border-collapse:collapse">${blocos.join("\n")}</table>`
        }

        <p style="font-size:11px;color:${CORES.navyMuted};margin:28px 0 0;padding-top:14px;border-top:1px solid ${CORES.borda}">
          Relatório automático do CRM ADM Soluções · gerado em ${dataFormatada}
        </p>
      </td></tr>
    </table>
  </div>`;
}
