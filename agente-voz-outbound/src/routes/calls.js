import { Router } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { config } from "../config.js";
import { getCall, upsertCall } from "../db/store.js";

export const callsRouter = Router();
const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * POST /calls/start  { "telefone": "+5511999999999", "nome": "Fulano" }
 *
 * Dispara uma ligação outbound. O `callId` que geramos aqui (não o SID do
 * Twilio) é o identificador que atravessa todo o sistema — ele vai na URL do
 * TwiML, depois no customParameter do Media Stream, e é a chave de
 * idempotência que o CRM recebe no webhook final.
 *
 * `nome` é opcional (nossa base — Casa dos Dados — normalmente já traz o
 * nome do dono da empresa). Quando vem, o agente usa pra se dirigir à pessoa
 * já na abertura ("falo com Fulano?") em vez de um "oi, tudo bem?" genérico.
 */
callsRouter.post("/start", async (req, res) => {
  // Protege contra qualquer um que descubra a URL do ngrok disparar ligação
  // (que custa dinheiro de verdade) — mesmo segredo que o CRM já usa pra
  // autenticar o webhook de resultado, só que na direção contrária.
  if (config.crm.webhookApiKey && req.get("x-api-key") !== config.crm.webhookApiKey) {
    return res.status(401).json({ erro: "x-api-key inválido ou ausente." });
  }

  const { telefone, nome } = req.body ?? {};
  if (!telefone || typeof telefone !== "string" || !/^\+\d{8,15}$/.test(telefone)) {
    return res.status(400).json({
      erro: "Envie { telefone: \"+55DDDNUMERO\" } em formato E.164 (com + e código do país).",
    });
  }
  const nomeLimpo = typeof nome === "string" && nome.trim() ? nome.trim().slice(0, 80) : null;

  const callId = randomUUID();
  await upsertCall(callId, {
    callId,
    telefone,
    nome: nomeLimpo,
    status: "discando",
    iniciadoEm: new Date().toISOString(),
  });

  try {
    const chamada = await twilioClient.calls.create({
      to: telefone,
      from: config.twilio.numeroOrigem,
      url: `${config.urlPublica}/twilio/voice?callId=${callId}`,
      method: "POST",
      statusCallback: `${config.urlPublica}/twilio/status?callId=${callId}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
    });

    await upsertCall(callId, { twilioCallSid: chamada.sid, status: "tocando" });
    console.log(`[${callId}] ligação criada no Twilio (SID ${chamada.sid}), discando pra ${telefone}...`);
    res.status(202).json({ callId, twilioCallSid: chamada.sid, status: "tocando" });
  } catch (err) {
    console.error(`[${callId}] falha ao criar ligação no Twilio:`, err.message);
    await upsertCall(callId, { status: "erro", erro: err.message });
    res.status(502).json({ erro: `Twilio recusou a ligação: ${err.message}` });
  }
});

/**
 * GET /calls/:callId — consulta rápida de status/resultado de uma ligação.
 * Útil pro script de teste único e pro disparo em lote acompanharem progresso.
 */
callsRouter.get("/:callId", async (req, res) => {
  const registro = await getCall(req.params.callId);
  if (!registro) return res.status(404).json({ erro: "callId não encontrado" });
  res.json(registro);
});
