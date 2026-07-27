"use client";

import { useSyncExternalStore } from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(CONSULTA).matches;
}

/** No servidor (e no primeiro render de hidratação) ainda não sabemos. */
function getServerSnapshot(): null {
  return null;
}

/**
 * Lê `prefers-reduced-motion` e acompanha mudanças em tempo real.
 *
 * Retorna `null` até a hidratação terminar. Quem consome deve tratar `null`
 * como "ainda não decidir" — é isso que garante que a introdução nunca comece
 * para quem pediu movimento reduzido.
 */
export default function usePrefersReducedMotion(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot);
}
