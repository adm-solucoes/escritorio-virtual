// Geração e download de CSV no client — sem depender de nenhuma lib externa,
// já que é só escapar vírgula/aspas/quebra de linha e montar o Blob.

function escaparCampo(valor: string): string {
  if (/[",\n;]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export function gerarCSV(colunas: string[], linhas: string[][]): string {
  const cabecalho = colunas.map(escaparCampo).join(",");
  const corpo = linhas.map((linha) => linha.map(escaparCampo).join(",")).join("\n");
  return `${cabecalho}\n${corpo}`;
}

/** BOM (﻿) no início pra Excel abrir acentos em UTF-8 corretamente. */
export function baixarCSV(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportarCSV(nomeArquivo: string, colunas: string[], linhas: string[][]) {
  baixarCSV(nomeArquivo, gerarCSV(colunas, linhas));
}
