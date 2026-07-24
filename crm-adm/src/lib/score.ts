import type { Empresa, Oportunidade } from "./types";

const PONTOS_ICP: Record<string, number> = { A: 40, B: 25, C: 10 };
const PONTOS_TEMPERATURA: Record<string, number> = { Quente: 30, Morno: 15, Frio: 5 };

export interface ScoreLead {
  pontos: number;
  motivos: string[];
}

export function calcularScoreLead(empresa: Empresa, oportunidadesDaEmpresa: Oportunidade[]): ScoreLead {
  let pontos = 0;
  const motivos: string[] = [];

  if (empresa.icp && PONTOS_ICP[empresa.icp]) {
    pontos += PONTOS_ICP[empresa.icp];
    motivos.push(`ICP ${empresa.icp}`);
  }

  if (empresa.temperatura && PONTOS_TEMPERATURA[empresa.temperatura]) {
    pontos += PONTOS_TEMPERATURA[empresa.temperatura];
    motivos.push(empresa.temperatura);
  }

  const abertas = oportunidadesDaEmpresa.filter((o) => o.etapa_atual !== "Perdido" && (o.probabilidade ?? 0) < 1);
  const valorAberto = abertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  if (valorAberto > 0) {
    pontos += 20;
    motivos.push("Oportunidade em aberto com valor");
  } else if (abertas.length > 0) {
    pontos += 10;
    motivos.push("Oportunidade em aberto");
  }

  const maisRecente = oportunidadesDaEmpresa
    .map((o) => o.ultima_interacao)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  if (maisRecente) {
    const dias = Math.floor((Date.now() - new Date(maisRecente).getTime()) / 86400000);
    if (dias <= 7) {
      pontos += 10;
      motivos.push("Interação recente");
    }
  }

  return { pontos: Math.min(pontos, 100), motivos };
}

export function classificarScore(pontos: number): { label: string; cor: string } {
  if (pontos >= 60) return { label: "Alto", cor: "text-red bg-red/10" };
  if (pontos >= 30) return { label: "Médio", cor: "text-amber-700 bg-amber-100" };
  return { label: "Baixo", cor: "text-navy/50 bg-navy/5" };
}
