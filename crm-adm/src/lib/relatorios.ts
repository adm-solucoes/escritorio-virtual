import type { Empresa, Gc, Oportunidade } from "./types";

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
