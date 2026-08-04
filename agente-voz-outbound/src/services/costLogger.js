import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(__dirname, "..", "..", "logs", "custos.log");

/**
 * Estima o custo de uma ligação já encerrada e grava uma linha em
 * logs/custos.log. É estimativa, não fatura: Twilio cobra por rota/destino,
 * Groq cobra por token real (aqui é aproximado por caracteres/4), então trate
 * como ordem de grandeza pra acompanhar o piloto, não como valor exato.
 */
export async function registrarCusto({ callId, duracaoSegundos, tokensEntrada, tokensSaida, caracteresFalados = 0 }) {
  const minutos = duracaoSegundos / 60;
  const c = config.custos;

  const twilio = c.twilioPorMinuto === null ? null : c.twilioPorMinuto * minutos;
  const deepgram = c.deepgramPorMinuto * minutos;
  const groq =
    (tokensEntrada / 1_000_000) * c.groqInputPorMilhaoTokens +
    (tokensSaida / 1_000_000) * c.groqOutputPorMilhaoTokens;

  // TTS: o custo real depende do provedor ativo — Cartesia cobra por
  // minuto de áudio, ElevenLabs por caractere sintetizado (plano Flash
  // v2.5, ~0.5 crédito/caractere, US$50/milhão de créditos ≈ US$25/milhão
  // de caracteres). Guarda os dois campos pra dar pra comparar depois.
  const tts =
    config.tts.provedor === "elevenlabs"
      ? (caracteresFalados / 1_000_000) * c.elevenlabsPorMilhaoCaracteres
      : c.cartesiaPorMinuto * minutos;

  const total = (twilio ?? 0) + deepgram + tts + groq;

  const linha = {
    ts: new Date().toISOString(),
    callId,
    duracaoSegundos: Number(duracaoSegundos.toFixed(1)),
    ttsProvedor: config.tts.provedor,
    custoUSD: {
      twilio: twilio === null ? "NAO_CONFIRMADO" : Number(twilio.toFixed(4)),
      deepgram: Number(deepgram.toFixed(4)),
      tts: Number(tts.toFixed(4)),
      groq: Number(groq.toFixed(4)),
      total: twilio === null ? `>= ${Number(total.toFixed(4))} (falta Twilio)` : Number(total.toFixed(4)),
    },
  };

  await fs.mkdir(path.dirname(ARQUIVO), { recursive: true });
  await fs.appendFile(ARQUIVO, JSON.stringify(linha) + "\n", "utf8");

  if (twilio === null) {
    console.warn(
      `[custo] CUSTO_TWILIO_POR_MINUTO não configurado — confira o preço real pra chamadas ` +
        `outbound pro destino que você está discando no console do Twilio e preencha no .env.`
    );
  }

  return linha;
}
