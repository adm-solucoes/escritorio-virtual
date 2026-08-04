import { WebSocketServer } from "ws";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import { config } from "./config.js";
import { ConversationSession } from "./conversation/ConversationSession.js";
import { extrairDadosDaLigacao } from "./services/extraction.js";
import { enviarResultadoParaCrm } from "./services/crmWebhook.js";
import { registrarCusto } from "./services/costLogger.js";
import { upsertCall, getCall } from "./db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Troca {{NOME_AGENTE}} pelo nome configurado (AGENTE_NOME no .env) — o
 * nome tem que combinar com o gênero da voz do TTS, então mora na config e
 * não fixo no texto dos prompts. */
function lerPrompt(arquivo) {
  return readFileSync(path.join(__dirname, "..", "prompts", arquivo), "utf8").replaceAll(
    "{{NOME_AGENTE}}",
    config.agente.nome
  );
}

const ROTEIRO_SISTEMA = lerPrompt("roteiro.txt");
/** Versão curta usada a partir do 2º turno — ver comentário em
 * ConversationSession. Opcional: se o arquivo não existir, a sessão cai no
 * roteiro completo (comportamento antigo, só mais caro em token). */
let ROTEIRO_CONTINUACAO = null;
try {
  ROTEIRO_CONTINUACAO = lerPrompt("roteiro-continuacao.txt");
} catch {
  console.warn("[prompts] roteiro-continuacao.txt não encontrado — usando o roteiro completo em todos os turnos.");
}
const ABERTURA_FIXA = lerPrompt("abertura.txt").trim();
const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * Busca os horários livres reais (agenda do time comercial no CRM) pra o
 * agente poder OFERECER um dia/horário concreto em vez de só perguntar "que
 * horário seria bom?" — timeout curto e falha silenciosa de propósito: se o
 * CRM estiver fora do ar, a ligação continua normal, só sem essa vantagem.
 */
async function buscarHorariosDisponiveis() {
  try {
    const urlBase = new URL(config.crm.webhookUrl).origin;
    const resposta = await fetch(`${urlBase}/api/agente-voz/horarios-disponiveis`, {
      headers: { "x-api-key": config.crm.webhookApiKey },
      signal: AbortSignal.timeout(3000),
    });
    if (!resposta.ok) return [];
    const dados = await resposta.json();
    return Array.isArray(dados.horarios) ? dados.horarios : [];
  } catch (err) {
    console.error("[media-stream] falha ao buscar horários disponíveis (seguindo sem eles):", err.message);
    return [];
  }
}

/**
 * Protocolo do Twilio Media Streams (mensagens JSON sobre o WebSocket):
 *   connected → start → media (repetido, um por frame ~20ms) → stop
 *
 * `start.customParameters.callId` é o nosso callId, que colocamos no TwiML em
 * `twilioVoice.js` — é assim que esta conexão de WebSocket "sem contexto" se
 * liga de volta ao registro da ligação.
 */
export function anexarServidorDeMediaStream(servidorHttp) {
  const wss = new WebSocketServer({ server: servidorHttp, path: "/media-stream" });

  wss.on("connection", (ws) => {
    let sessao = null;
    let callId = null;
    let streamSid = null;
    let iniciadoEm = null;
    const marcasPendentes = new Map(); // nome da marca -> resolve()

    ws.on("message", async (dadosBrutos) => {
      let evento;
      try {
        evento = JSON.parse(dadosBrutos.toString());
      } catch {
        return;
      }

      switch (evento.event) {
        case "start": {
          streamSid = evento.start.streamSid;
          callId = evento.start.customParameters?.callId;
          const nomeLead = evento.start.customParameters?.nome || null;
          iniciadoEm = Date.now();

          if (!callId) {
            console.error("[media-stream] start sem callId — encerrando conexão.");
            ws.close();
            return;
          }

          await upsertCall(callId, { status: "em_andamento", streamSid });
          console.log(`[${callId}] media-stream conectado (streamSid=${streamSid}) — sessão de conversa iniciando.`);

          // NÃO faz `await` aqui — isso ficava bloqueando a Fernanda de falar
          // a primeira palavra por até 3s (timeout da busca), causando
          // silêncio real logo no início da ligação. A sessão começa a falar
          // já, e os horários entram no system prompt assim que a busca
          // terminar (ver `atualizarHorariosDisponiveis` — dá tempo de sobra
          // antes do primeiro turno de LLM de verdade, que só acontece depois
          // da pessoa responder à abertura).
          let horariosCompletos = [];
          buscarHorariosDisponiveis()
            .then((horarios) => {
              horariosCompletos = horarios;
              sessao?.atualizarHorariosDisponiveis(horarios.map((h) => h.display));
            })
            .catch(() => {});

          sessao = new ConversationSession({
            callId,
            systemPrompt: ROTEIRO_SISTEMA,
            systemPromptContinuacao: ROTEIRO_CONTINUACAO,
            aberturaFixa: ABERTURA_FIXA,
            nomeLead,
            horariosDisponiveis: [],
            onAudioParaTwilio: (bufferMulaw) => {
              if (ws.readyState !== ws.OPEN) return;
              ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid,
                  media: { payload: bufferMulaw.toString("base64") },
                })
              );
            },
            onLimparBufferTwilio: () => {
              if (ws.readyState !== ws.OPEN) return;
              ws.send(JSON.stringify({ event: "clear", streamSid }));
            },
            onAguardarReproducaoCompleta: () => {
              // Manda áudio pro WebSocket não significa que já tocou no
              // telefone — a Twilio ainda tem um buffer de reprodução em
              // tempo real do outro lado. Uma "mark" é ecoada de volta só
              // depois que tudo que foi mandado antes dela já tocou de
              // verdade; é assim que a Twilio recomenda sincronizar isso.
              if (ws.readyState !== ws.OPEN) return Promise.resolve();
              const nome = `fim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              const promessa = new Promise((resolve) => {
                marcasPendentes.set(nome, resolve);
                // Rede de segurança: se a marca nunca voltar (conexão caiu
                // etc), não trava o encerramento da ligação pra sempre.
                setTimeout(() => {
                  if (marcasPendentes.delete(nome)) resolve();
                }, 5000);
              });
              ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name: nome } }));
              return promessa;
            },
            onEncerrarLigacao: async () => {
              // O agente decidiu (via marcador do LLM) que a conversa acabou.
              // Desliga a ligação de verdade pelo lado da Twilio — o evento
              // "stop" do media-stream chega logo em seguida e dispara o
              // encerramento normal da sessão (extração, webhook do CRM etc).
              //
              // A confirmação de "mark" garante só que o buffer INTERNO da
              // Twilio esvaziou — ainda pode sobrar uma fração de segundo de
              // trânsito até o áudio realmente sair na ligação (rede da
              // operadora). Essa margem cobre essa folga; visto na prática
              // a despedida sendo cortada mesmo depois do mark confirmar.
              // Subido de 700ms pra 2s (2026-08-02): a despedida ainda estava
              // cortando às vezes com 700ms — silêncio a mais no fim é bem
              // menos ruim que cortar a última frase da Fernanda.
              await new Promise((r) => setTimeout(r, 2000));
              try {
                const registro = await getCall(callId);
                if (registro?.twilioCallSid) {
                  await twilioClient.calls(registro.twilioCallSid).update({ status: "completed" });
                  console.log(`[${callId}] ligação encerrada pelo agente (fim de conversa detectado).`);
                }
              } catch (err) {
                console.error(`[${callId}] falha ao encerrar ligação pelo agente:`, err.message);
              }
            },
            onFinalizar: (resultado) => finalizarLigacao(callId, iniciadoEm, resultado, horariosCompletos),
          });
          break;
        }

        case "media": {
          if (sessao) sessao.receberAudioDoUsuario(Buffer.from(evento.media.payload, "base64"));
          break;
        }

        case "stop": {
          sessao?.encerrar();
          sessao = null;
          break;
        }

        case "mark": {
          const resolve = marcasPendentes.get(evento.mark?.name);
          if (resolve) {
            marcasPendentes.delete(evento.mark.name);
            resolve();
          }
          break;
        }

        default:
          break; // "connected" não precisa de tratamento aqui
      }
    });

    ws.on("close", () => {
      // Se a conexão caiu sem um "stop" formal (queda de rede, etc), ainda
      // assim finaliza a sessão pra não perder a transcrição já acumulada.
      if (sessao) {
        sessao.encerrar();
        sessao = null;
      }
    });

    ws.on("error", (err) => console.error("[media-stream] erro no WebSocket:", err.message));
  });

  return wss;
}

async function finalizarLigacao(
  callId,
  iniciadoEm,
  { transcricaoCompleta, tokensEntradaTotal, tokensSaidaTotal, caracteresFaladosTotal },
  horariosCompletos = []
) {
  const duracaoSegundos = iniciadoEm ? (Date.now() - iniciadoEm) / 1000 : 0;
  const registro = await getCall(callId);

  await upsertCall(callId, {
    status: "processando_resultado",
    duracaoSegundos,
    transcricaoCompleta,
  });

  await registrarCusto({
    callId,
    duracaoSegundos,
    tokensEntrada: tokensEntradaTotal,
    tokensSaida: tokensSaidaTotal,
    caracteresFalados: caracteresFaladosTotal,
  });

  try {
    const extraido = await extrairDadosDaLigacao(
      transcricaoCompleta,
      horariosCompletos.map((h) => h.display)
    );
    const transcricaoTexto = transcricaoCompleta
      .map((t) => `${t.papel === "agente" ? "AGENTE" : "LEAD"}: ${t.texto}`)
      .join("\n");

    // Se a extração identificou que o lead confirmou um dos horários
    // oferecidos, acha o objeto completo (gc_id + ISO) correspondente pra
    // mandar pro CRM criar o evento de verdade — a extração só devolve o
    // texto, a gente que sabe o resto por já ter guardado desde o início.
    const horarioConfirmado = extraido.horario_confirmado
      ? horariosCompletos.find((h) => h.display === extraido.horario_confirmado)
      : null;

    const envio = await enviarResultadoParaCrm({
      callId,
      telefone: registro?.telefone,
      extraido: { ...extraido, transcricaoTexto },
      horarioConfirmado,
    });

    await upsertCall(callId, {
      status: "concluida",
      extraido,
      webhookCrmEnviado: envio.ok,
    });
  } catch (err) {
    console.error(`[${callId}] falha ao extrair/enviar resultado:`, err.message ?? err);
    await upsertCall(callId, { status: "erro_pos_processamento", erro: err.message });
  }
}
