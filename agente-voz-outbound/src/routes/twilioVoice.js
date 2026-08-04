import { Router } from "express";
import twilio from "twilio";
import { config } from "../config.js";
import { getCall, upsertCall } from "../db/store.js";

export const twilioVoiceRouter = Router();
const { VoiceResponse } = twilio.twiml;

/**
 * POST /twilio/voice — a Twilio chama isto assim que a ligação é atendida.
 * Devolve TwiML que conecta um Media Stream BIDIRECIONAL (`<Connect><Stream>`,
 * não `<Start><Stream>`, que é só de escuta) pro nosso WebSocket.
 *
 * O `callId` (nosso, gerado em /calls/start) vem na query string da própria
 * URL que registramos como webhook da ligação — repassamos ele como
 * <Parameter> do Stream pra o handler do WebSocket saber a qual ligação/
 * sessão de conversa aquela conexão pertence (chega no evento "start").
 */
twilioVoiceRouter.post("/voice", async (req, res) => {
  const callId = req.query.callId;
  if (!callId) {
    console.error("POST /twilio/voice sem callId na query string — TwiML de erro.");
    const resposta = new VoiceResponse();
    resposta.say({ language: "pt-BR" }, "Erro de configuração. Encerrando.");
    resposta.hangup();
    res.type("text/xml").send(resposta.toString());
    return;
  }

  await upsertCall(callId, { status: "conectado", conectadoEm: new Date().toISOString() });
  const registro = await getCall(callId);

  const urlWebSocket = config.urlPublica.replace(/^https:/, "wss:") + "/media-stream";

  const resposta = new VoiceResponse();
  const connect = resposta.connect();
  const stream = connect.stream({ url: urlWebSocket });
  stream.parameter({ name: "callId", value: callId });
  if (registro?.nome) stream.parameter({ name: "nome", value: registro.nome });

  // Log de propósito: sem isto, um webhook que falha por causa do túnel (ex:
  // Cloudflare quick tunnel devolvendo 502) é invisível nos nossos logs — só
  // se vê pelo lado do Twilio como "silêncio" ou a mensagem de erro padrão
  // deles (em inglês). Foi exatamente isso que aconteceu no primeiro teste
  // real, e não tinha como confirmar direto por aqui até este log existir.
  console.log(`[${callId}] /twilio/voice atendido, TwiML enviado, WebSocket alvo: ${urlWebSocket}`);

  res.type("text/xml").send(resposta.toString());
});

/**
 * POST /twilio/status — status callback da ligação (configurado só para o
 * evento "completed"). Serve como rede de segurança: o encerramento "de
 * verdade" da conversa acontece no evento "stop" do media-stream (ali temos a
 * transcrição em memória pra rodar a extração), isto aqui só garante que o
 * registro da ligação não fique com status desatualizado se o WebSocket cair
 * antes do "stop" chegar por algum motivo.
 */
twilioVoiceRouter.post("/status", async (req, res) => {
  const callId = req.query.callId;
  const status = req.body?.CallStatus;
  const duracao = req.body?.CallDuration;
  if (callId) {
    await upsertCall(callId, {
      statusTwilio: status,
      duracaoSegundosTwilio: duracao ? Number(duracao) : undefined,
    });
  }
  res.sendStatus(200);
});
