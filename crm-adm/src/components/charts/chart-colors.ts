// Paleta dos gráficos do Dashboard.
//
// As cores das séries são validadas como colorblind-safe (validador do skill
// dataviz — checa banda de luminosidade, separação CVD e contraste). O texto e
// os eixos usam a tinta institucional ADM (navy sobre cartão branco). Cores por
// entidade são fixas: cada categoria tem sempre a mesma cor.

export const CORES_TEMPERATURA: Record<string, string> = {
  Frio: "#2a78d6", // azul  — frio
  Morno: "#eda100", // amarelo — morno
  Quente: "#e34948", // vermelho — quente
  "Sem dados": "#a8a29e",
};

export const CORES_ICP: Record<string, string> = {
  A: "#1baf7a", // aqua — melhor fit
  B: "#4a3aa7", // violeta
  C: "#eb6834", // laranja
  "Sem dados": "#a8a29e",
};

export const COR_GANHOS = "#2a78d6"; // azul
export const COR_PERDAS = "#e34948"; // vermelho

// Rampa azul sequencial (ordinal) — usada no funil, que é uma escala ordenada
// de etapas (não categorias distintas). Do mais claro (topo) ao mais escuro.
export const RAMPA_AZUL = [
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
  "#104281",
];

export function corDaRampa(indice: number, total: number): string {
  if (total <= 1) return RAMPA_AZUL[3];
  const pos = Math.round((indice / (total - 1)) * (RAMPA_AZUL.length - 1));
  return RAMPA_AZUL[pos];
}

// Tinta / chrome — paleta institucional ADM.
export const TINTA = {
  primaria: "#150638",
  secundaria: "rgba(21,6,56,0.55)",
  muted: "rgba(21,6,56,0.40)",
  eixo: "rgba(21,6,56,0.12)",
  grade: "rgba(21,6,56,0.07)",
};
