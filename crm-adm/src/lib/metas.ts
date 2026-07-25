import type { Oportunidade } from "./types";
import { chaveMes, isGanha } from "./relatorios";

export function realizadoNoMes(oportunidades: Oportunidade[], mes: number, ano: number, gcId?: string | null) {
  const chaveAlvo = `${ano}-${String(mes).padStart(2, "0")}`;
  return oportunidades
    .filter((o) => isGanha(o))
    .filter((o) => chaveMes(o.atualizado_em ?? o.criado_em) === chaveAlvo)
    .filter((o) => (gcId ? o.gc_responsavel_id === gcId : true))
    .reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
}
