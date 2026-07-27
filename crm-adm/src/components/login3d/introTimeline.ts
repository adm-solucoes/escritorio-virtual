/**
 * Máquina de estados da intro cinematográfica (Etapa 3).
 *
 * 10 cenas, cada uma com duração fixa em segundos. `IntroStage.tsx` avança
 * de uma pra outra automaticamente; a página de prévia (`/mascote`) também
 * permite pular direto pra qualquer cena — útil justamente porque este
 * ambiente não renderiza 3D, então a forma de revisar isso é você clicando
 * cena por cena num navegador de verdade.
 */

export const CENAS = [
  "vazio",
  "correndoEntrada",
  "farejando",
  "correndoSaida",
  "retornandoComPainel",
  "posicionando",
  "empurrando",
  "soltando",
  "comemorando",
  "idle",
] as const;

export type Cena = (typeof CENAS)[number];

export const LABEL_CENA: Record<Cena, string> = {
  vazio: "1. Vazio",
  correndoEntrada: "2. Corre pra dentro",
  farejando: "3. Fareja o ambiente",
  correndoSaida: "4. Corre pra fora",
  retornandoComPainel: "5. Volta com o painel",
  posicionando: "6. Posiciona o painel",
  empurrando: "7. Empurra até o lugar",
  soltando: "8. Solta o painel",
  comemorando: "9. Comemora",
  idle: "10. Idle (fim da intro)",
};

/** Duração de cada cena, em segundos. `idle` não tem fim — a última "duração"
 * nunca é checada porque não há próxima cena. */
export const DURACAO_CENA: Record<Cena, number> = {
  vazio: 0.6,
  correndoEntrada: 1.3,
  farejando: 1.8,
  correndoSaida: 0.9,
  retornandoComPainel: 1.6,
  posicionando: 0.9,
  empurrando: 0.6,
  soltando: 0.5,
  comemorando: 1.6,
  idle: Infinity,
};

export const CHAVE_LOCALSTORAGE = "dogLoginIntroSeen";

export function indiceDaCena(cena: Cena): number {
  return CENAS.indexOf(cena);
}

/** Easing suave de entrada/saída — usado nos deslocamentos de posição das
 * cenas de corrida, pra simular aceleração e desaceleração em vez de
 * velocidade constante (pedido explícito do prompt original). */
export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
