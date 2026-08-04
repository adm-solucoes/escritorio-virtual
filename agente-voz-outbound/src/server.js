import express from "express";
import http from "node:http";
import { config, validarConfig } from "./config.js";
import { callsRouter } from "./routes/calls.js";
import { twilioVoiceRouter } from "./routes/twilioVoice.js";
import { anexarServidorDeMediaStream } from "./mediaStreamServer.js";

validarConfig();

/**
 * Rede de segurança de último recurso. Este processo atende MÚLTIPLAS
 * ligações simultâneas (WebSocket por ligação) — um erro não tratado em
 * qualquer uma delas (ex: uma lib de terceiro lançando de forma síncrona,
 * como já aconteceu em teste com o fechamento da conexão da Cartesia) NÃO
 * PODE derrubar o processo inteiro e cortar todas as outras ligações do lote
 * no meio da conversa. Loga bem alto e segue vivo.
 *
 * Isto é rede de segurança, não desculpa pra não tratar o erro na origem —
 * cada lugar identificado dessa forma foi corrigido também no próprio módulo.
 */
process.on("uncaughtException", (err) => {
  console.error("\n🚨 uncaughtException (processo NÃO foi derrubado):", err);
});
process.on("unhandledRejection", (motivo) => {
  console.error("\n🚨 unhandledRejection (processo NÃO foi derrubado):", motivo);
});

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio manda status callback como form-urlencoded
app.use(express.json());

app.get("/", (_req, res) => res.json({ ok: true, servico: "agente-voz-outbound" }));

app.use("/calls", callsRouter);
app.use("/twilio", twilioVoiceRouter);

const servidorHttp = http.createServer(app);
anexarServidorDeMediaStream(servidorHttp);

servidorHttp.listen(config.porta, () => {
  console.log(`Servidor no ar em http://localhost:${config.porta}`);
  console.log(`URL pública configurada: ${config.urlPublica}`);
  console.log(`  → webhook de voz:  ${config.urlPublica}/twilio/voice`);
  console.log(`  → media stream:    ${config.urlPublica.replace(/^https:/, "wss:")}/media-stream`);
  if (config.custos.twilioPorMinuto === null) {
    console.warn("⚠ CUSTO_TWILIO_POR_MINUTO não configurado — ver README (seção de custos).");
  }
});
