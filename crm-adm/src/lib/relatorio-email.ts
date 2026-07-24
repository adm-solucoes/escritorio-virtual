import type { Empresa, Gc, Oportunidade } from "./types";
import {
  evolucaoPipeline,
  relatorioMensal,
  relatorioPerdas,
  relatorioPorOrigem,
  relatorioPorResponsavel,
} from "./relatorios";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function tabela(colunas: string[], linhas: (string | number)[][]) {
  if (linhas.length === 0) {
    return `<p style="color:#666;font-size:13px;margin:0 0 16px">Sem dados ainda.</p>`;
  }
  const th = colunas.map((c) => `<th style="text-align:left;padding:6px 10px;background:#f2f0eb;color:#555;font-size:12px;border-bottom:1px solid #ddd">${c}</th>`).join("");
  const rows = linhas
    .map(
      (linha) =>
        `<tr>${linha
          .map((v, i) => `<td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #eee;${i === 0 ? "font-weight:600;color:#150638" : "color:#444"}">${v}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 20px"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

function secao(titulo: string, conteudoHtml: string) {
  return `<h2 style="font-size:15px;color:#150638;margin:24px 0 8px">${titulo}</h2>${conteudoHtml}`;
}

export function montarRelatorioHtml(empresas: Empresa[], oportunidades: Oportunidade[], gcs: Gc[]) {
  const mensal = relatorioMensal(oportunidades);
  const perdas = relatorioPerdas(oportunidades);
  const origem = relatorioPorOrigem(empresas, oportunidades);
  const responsavel = relatorioPorResponsavel(oportunidades, gcs);
  const evolucao = evolucaoPipeline(empresas, oportunidades);

  const hoje = new Date().toLocaleDateString("pt-BR");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#150638">
    <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
      <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções · Relatório Comercial</span>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:20px">
      <p style="font-size:12px;color:#888;margin:0 0 8px">Gerado em ${hoje}</p>

      ${secao(
        "Relatório mensal de vendas",
        tabela(
          ["Mês", "Ganhas", "Valor ganho", "Perdidas", "Valor perdido"],
          mensal.map((m) => [m.label, m.qtdGanhas, moeda(m.valorGanho), m.qtdPerdidas, moeda(m.valorPerdido)])
        )
      )}

      ${secao(
        "Relatório de perdas por motivo",
        tabela(
          ["Motivo", "Qtd", "Valor"],
          perdas.map((p) => [p.motivo, p.qtd, moeda(p.valor)])
        )
      )}

      ${secao(
        "Relatório por origem de lead",
        tabela(
          ["Origem", "Leads", "Oportunidades", "Valor ganho"],
          origem.map((o) => [o.origem, o.leads, o.oportunidades, moeda(o.valorGanho)])
        )
      )}

      ${secao(
        "Relatório por responsável",
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
      )}

      ${secao(
        "Evolução (novos leads e oportunidades por mês)",
        tabela(
          ["Mês", "Novas empresas", "Novas oportunidades"],
          evolucao.map((e) => [e.label, e.novasEmpresas, e.novasOportunidades])
        )
      )}

      <p style="font-size:11px;color:#999;margin-top:24px">Relatório automático do CRM ADM Soluções.</p>
    </div>
  </div>`;
}
