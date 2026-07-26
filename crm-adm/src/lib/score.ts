import type { Empresa, Oportunidade, ScoreRule } from "./types";

export interface ScoreLead {
  pontos: number;
  motivos: string[];
}

// Pesos padrão — usados só como fallback caso a tabela `score_rules` ainda não tenha
// sido carregada (ex: antes da migração rodar, ou enquanto a página ainda busca os dados).
const PESOS_PADRAO: Record<string, number> = {
  icp_a: 40,
  icp_b: 25,
  icp_c: 10,
  temperatura_quente: 30,
  temperatura_morno: 15,
  temperatura_frio: 5,
  oportunidade_com_valor: 20,
  oportunidade_sem_valor: 10,
  interacao_recente: 10,
};

function pesoPara(chave: string, mapaPesos: Map<string, ScoreRule> | null): number {
  const regra = mapaPesos?.get(chave);
  if (regra) return regra.ativo ? regra.peso : 0;
  return PESOS_PADRAO[chave] ?? 0;
}

export function calcularScoreLead(
  empresa: Empresa,
  oportunidadesDaEmpresa: Oportunidade[],
  regras?: ScoreRule[]
): ScoreLead {
  const mapaPesos = regras ? new Map(regras.map((r) => [r.chave, r])) : null;
  let pontos = 0;
  const motivos: string[] = [];

  if (empresa.icp) {
    const peso = pesoPara(`icp_${empresa.icp.toLowerCase()}`, mapaPesos);
    if (peso > 0) {
      pontos += peso;
      motivos.push(`ICP ${empresa.icp}`);
    }
  }

  if (empresa.temperatura) {
    const chave = `temperatura_${empresa.temperatura === "Quente" ? "quente" : empresa.temperatura === "Morno" ? "morno" : "frio"}`;
    const peso = pesoPara(chave, mapaPesos);
    if (peso > 0) {
      pontos += peso;
      motivos.push(empresa.temperatura);
    }
  }

  const abertas = oportunidadesDaEmpresa.filter((o) => o.etapa_atual !== "Perdido" && (o.probabilidade ?? 0) < 1);
  const valorAberto = abertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
  if (valorAberto > 0) {
    pontos += pesoPara("oportunidade_com_valor", mapaPesos);
    motivos.push("Oportunidade em aberto com valor");
  } else if (abertas.length > 0) {
    pontos += pesoPara("oportunidade_sem_valor", mapaPesos);
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
      pontos += pesoPara("interacao_recente", mapaPesos);
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
