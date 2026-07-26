import type { Empresa, Gc, Oportunidade, OportunidadeHistoricoEtapa, PipelineSnapshot } from "./types";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function mesAno(iso: string) {
  const d = new Date(iso);
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

export function chaveMes(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isGanha(o: Oportunidade) {
  return (o.probabilidade ?? 0) >= 1 && o.etapa_atual !== "Perdido";
}

export function isPerdida(o: Oportunidade) {
  return o.etapa_atual === "Perdido";
}

export interface RelatorioMensal {
  chave: string;
  label: string;
  qtdGanhas: number;
  valorGanho: number;
  qtdPerdidas: number;
  valorPerdido: number;
}

export function relatorioMensal(oportunidades: Oportunidade[]): RelatorioMensal[] {
  const map = new Map<string, RelatorioMensal>();
  for (const o of oportunidades) {
    if (!isGanha(o) && !isPerdida(o)) continue;
    const dataRef = o.atualizado_em ?? o.criado_em;
    const chave = chaveMes(dataRef);
    const atual = map.get(chave) ?? { chave, label: mesAno(dataRef), qtdGanhas: 0, valorGanho: 0, qtdPerdidas: 0, valorPerdido: 0 };
    if (isGanha(o)) {
      atual.qtdGanhas += 1;
      atual.valorGanho += o.valor_estimado ?? 0;
    } else {
      atual.qtdPerdidas += 1;
      atual.valorPerdido += o.valor_estimado ?? 0;
    }
    map.set(chave, atual);
  }
  return [...map.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

export interface RelatorioPerdas {
  motivo: string;
  qtd: number;
  valor: number;
}

export function relatorioPerdas(oportunidades: Oportunidade[]): RelatorioPerdas[] {
  const map = new Map<string, RelatorioPerdas>();
  for (const o of oportunidades.filter(isPerdida)) {
    const motivo = o.motivo_perda ?? "Não informado";
    const atual = map.get(motivo) ?? { motivo, qtd: 0, valor: 0 };
    atual.qtd += 1;
    atual.valor += o.valor_estimado ?? 0;
    map.set(motivo, atual);
  }
  return [...map.values()].sort((a, b) => b.qtd - a.qtd);
}

export interface RelatorioOrigem {
  origem: string;
  leads: number;
  oportunidades: number;
  valorGanho: number;
}

export function relatorioPorOrigem(empresas: Empresa[], oportunidades: Oportunidade[]): RelatorioOrigem[] {
  const oppsPorEmpresa = new Map<string, Oportunidade[]>();
  for (const o of oportunidades) {
    const arr = oppsPorEmpresa.get(o.empresa_id) ?? [];
    arr.push(o);
    oppsPorEmpresa.set(o.empresa_id, arr);
  }
  const map = new Map<string, RelatorioOrigem>();
  for (const e of empresas) {
    const origem = e.origem_lead ?? "Não informado";
    const atual = map.get(origem) ?? { origem, leads: 0, oportunidades: 0, valorGanho: 0 };
    atual.leads += 1;
    const opps = oppsPorEmpresa.get(e.id) ?? [];
    atual.oportunidades += opps.length;
    atual.valorGanho += opps.filter(isGanha).reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
    map.set(origem, atual);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

export interface RelatorioResponsavel {
  gcId: string | null;
  nome: string;
  abertas: number;
  ganhas: number;
  perdidas: number;
  valorPipeline: number;
  valorGanho: number;
  taxaConversao: number;
}

export function relatorioPorResponsavel(oportunidades: Oportunidade[], gcs: Gc[]): RelatorioResponsavel[] {
  const nomePorId = new Map(gcs.map((g) => [g.id, g.nome]));
  const map = new Map<string, RelatorioResponsavel>();
  for (const o of oportunidades) {
    const gcId = o.gc_responsavel_id ?? "sem-responsavel";
    const nome = o.gc_responsavel_id ? nomePorId.get(o.gc_responsavel_id) ?? "—" : "Sem responsável";
    const atual = map.get(gcId) ?? { gcId: o.gc_responsavel_id, nome, abertas: 0, ganhas: 0, perdidas: 0, valorPipeline: 0, valorGanho: 0, taxaConversao: 0 };
    if (isGanha(o)) {
      atual.ganhas += 1;
      atual.valorGanho += o.valor_estimado ?? 0;
    } else if (isPerdida(o)) {
      atual.perdidas += 1;
    } else {
      atual.abertas += 1;
      atual.valorPipeline += o.valor_estimado ?? 0;
    }
    map.set(gcId, atual);
  }
  for (const r of map.values()) {
    const decididas = r.ganhas + r.perdidas;
    r.taxaConversao = decididas ? (r.ganhas / decididas) * 100 : 0;
  }
  return [...map.values()].sort((a, b) => b.valorGanho - a.valorGanho);
}

export interface EvolucaoMensal {
  chave: string;
  label: string;
  novasEmpresas: number;
  novasOportunidades: number;
}

export function evolucaoPipeline(empresas: Empresa[], oportunidades: Oportunidade[]): EvolucaoMensal[] {
  const map = new Map<string, EvolucaoMensal>();
  for (const e of empresas) {
    if (!e.criado_em) continue;
    const chave = chaveMes(e.criado_em);
    const atual = map.get(chave) ?? { chave, label: mesAno(e.criado_em), novasEmpresas: 0, novasOportunidades: 0 };
    atual.novasEmpresas += 1;
    map.set(chave, atual);
  }
  for (const o of oportunidades) {
    const chave = chaveMes(o.criado_em);
    const atual = map.get(chave) ?? { chave, label: mesAno(o.criado_em), novasEmpresas: 0, novasOportunidades: 0 };
    atual.novasOportunidades += 1;
    map.set(chave, atual);
  }
  return [...map.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

export interface TempoMedioEtapa {
  etapa: string;
  diasMedios: number;
  amostras: number;
}

// Tempo médio (em dias) que as oportunidades passaram em cada etapa, calculado a partir
// do histórico real de mudança de etapa (oportunidade_historico_etapa) — substitui o
// proxy da Fase 1 baseado em atualizado_em.
export function tempoMedioPorEtapa(historico: OportunidadeHistoricoEtapa[]): TempoMedioEtapa[] {
  const porOportunidade = new Map<string, OportunidadeHistoricoEtapa[]>();
  for (const h of historico) {
    const arr = porOportunidade.get(h.oportunidade_id) ?? [];
    arr.push(h);
    porOportunidade.set(h.oportunidade_id, arr);
  }

  const somaDias = new Map<string, number>();
  const contagem = new Map<string, number>();

  for (const eventos of porOportunidade.values()) {
    const ordenados = [...eventos].sort((a, b) => new Date(a.data_mudanca).getTime() - new Date(b.data_mudanca).getTime());
    for (let i = 0; i < ordenados.length; i++) {
      const inicio = new Date(ordenados[i].data_mudanca).getTime();
      const fim = i + 1 < ordenados.length ? new Date(ordenados[i + 1].data_mudanca).getTime() : Date.now();
      const dias = (fim - inicio) / 86400000;
      const etapa = ordenados[i].etapa_nova;
      somaDias.set(etapa, (somaDias.get(etapa) ?? 0) + dias);
      contagem.set(etapa, (contagem.get(etapa) ?? 0) + 1);
    }
  }

  return [...somaDias.keys()]
    .map((etapa) => ({
      etapa,
      diasMedios: Math.round((somaDias.get(etapa) ?? 0) / (contagem.get(etapa) ?? 1)),
      amostras: contagem.get(etapa) ?? 0,
    }))
    .sort((a, b) => b.diasMedios - a.diasMedios);
}

const ORDEM_FUNIL_COMERCIAL = ["Prospect", "Briefing", "Planejamento", "Validação", "Proposta", "Negociação", "Contrato Fechado"] as const;

export interface EtapaFunilConversao {
  etapa: string;
  qtd: number;
  percentualDoTopo: number;
  percentualEtapaAnterior: number | null;
}

// Funil de conversão do pipeline Comercial: pra cada oportunidade, olha a etapa mais
// avançada que ela já alcançou (via histórico + etapa atual) e conta quantas chegaram em
// cada etapa — "Perdido" e etapas do pipeline de CS não entram na ordem, só descartam
// a oportunidade das etapas seguintes que ela não alcançou.
export function funilConversao(oportunidades: Oportunidade[], historico: OportunidadeHistoricoEtapa[]): EtapaFunilConversao[] {
  const indicePorEtapa = new Map(ORDEM_FUNIL_COMERCIAL.map((e, i) => [e as string, i]));
  const maxIndicePorOportunidade = new Map<string, number>();

  function considerar(oportunidadeId: string, etapa: string) {
    const idx = indicePorEtapa.get(etapa);
    if (idx === undefined) return;
    const atual = maxIndicePorOportunidade.get(oportunidadeId) ?? -1;
    if (idx > atual) maxIndicePorOportunidade.set(oportunidadeId, idx);
  }

  const comerciais = oportunidades.filter((o) => o.tipo_pipeline === "comercial");
  const idsComerciais = new Set(comerciais.map((o) => o.id));
  for (const o of comerciais) considerar(o.id, o.etapa_atual);
  for (const h of historico) {
    if (!idsComerciais.has(h.oportunidade_id)) continue;
    considerar(h.oportunidade_id, h.etapa_nova);
  }

  const qtdPorEtapa = ORDEM_FUNIL_COMERCIAL.map((etapa, i) => {
    let qtd = 0;
    for (const maxIdx of maxIndicePorOportunidade.values()) if (maxIdx >= i) qtd += 1;
    return { etapa, qtd };
  });

  const topo = qtdPorEtapa[0]?.qtd ?? 0;
  return qtdPorEtapa.map((atual, i) => ({
    etapa: atual.etapa,
    qtd: atual.qtd,
    percentualDoTopo: topo ? Math.round((atual.qtd / topo) * 100) : 0,
    percentualEtapaAnterior:
      i === 0 ? null : qtdPorEtapa[i - 1].qtd ? Math.round((atual.qtd / qtdPorEtapa[i - 1].qtd) * 100) : 0,
  }));
}

export interface CicloVendas {
  diasMedios: number;
  amostras: number;
}

// Ciclo total de vendas do pipeline Comercial (Prospect -> Contrato Fechado), medido
// pela diferença entre a criação da oportunidade e o evento de histórico em que ela
// entrou em "Contrato Fechado". Só entram oportunidades que realmente fecharam.
export function cicloVendasComercial(historico: OportunidadeHistoricoEtapa[]): CicloVendas {
  const porOportunidade = new Map<string, OportunidadeHistoricoEtapa[]>();
  for (const h of historico) {
    const arr = porOportunidade.get(h.oportunidade_id) ?? [];
    arr.push(h);
    porOportunidade.set(h.oportunidade_id, arr);
  }

  let somaDias = 0;
  let amostras = 0;
  for (const eventos of porOportunidade.values()) {
    const ordenados = [...eventos].sort((a, b) => new Date(a.data_mudanca).getTime() - new Date(b.data_mudanca).getTime());
    const criacao = ordenados.find((h) => h.etapa_anterior === null) ?? ordenados[0];
    const fechamento = ordenados.find((h) => h.etapa_nova === "Contrato Fechado");
    if (!criacao || !fechamento) continue;
    const dias = (new Date(fechamento.data_mudanca).getTime() - new Date(criacao.data_mudanca).getTime()) / 86400000;
    if (dias < 0) continue;
    somaDias += dias;
    amostras += 1;
  }
  return { diasMedios: amostras ? Math.round(somaDias / amostras) : 0, amostras };
}

export interface EvolucaoValorPipeline {
  data: string;
  valorTotal: number;
  valorPonderado: number;
  qtd: number;
}

// Evolução do valor do pipeline ao longo do tempo, a partir das fotos diárias
// (pipeline_snapshot) — ao contrário de evolucaoPipeline(), mostra o valor em aberto
// em cada dia, não só a contagem de leads/oportunidades novas.
export function evolucaoValorPipeline(snapshots: PipelineSnapshot[], tipoPipeline: "comercial" | "cs"): EvolucaoValorPipeline[] {
  const map = new Map<string, EvolucaoValorPipeline>();
  for (const s of snapshots) {
    if (s.tipo_pipeline !== tipoPipeline || s.etapa === "Perdido") continue;
    const atual = map.get(s.data) ?? { data: s.data, valorTotal: 0, valorPonderado: 0, qtd: 0 };
    atual.valorTotal += s.valor_total;
    atual.valorPonderado += s.valor_ponderado;
    atual.qtd += s.qtd;
    map.set(s.data, atual);
  }
  return [...map.values()].sort((a, b) => a.data.localeCompare(b.data));
}
