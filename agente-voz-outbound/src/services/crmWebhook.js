import { config } from "../config.js";

/**
 * Envia o resultado da ligação pro CRM. `call_id` é a chave de idempotência —
 * o CRM deve usar isso pra não processar a mesma ligação duas vezes (ex: se
 * este processo reiniciar e reenviar).
 *
 * O agente de voz NUNCA fala com a API do WhatsApp diretamente — só entrega
 * `trigger_whatsapp_followup` + `whatsapp_template`, e é o CRM (que já tem
 * essa responsabilidade) quem decide disparar ou não.
 */
export async function enviarResultadoParaCrm({ callId, telefone, extraido, horarioConfirmado }) {
  const disparar =
    config.crm.regraDisparoWhatsapp === "sempre" ? true : Boolean(extraido.interessado);

  const payload = {
    call_id: callId,
    telefone,
    interessado: extraido.interessado,
    motivo_recusa: extraido.motivo_recusa,
    melhor_horario_retorno: extraido.melhor_horario_retorno,
    resumo: extraido.resumo,
    transcricao_completa: extraido.transcricaoTexto,
    trigger_whatsapp_followup: disparar,
    whatsapp_template: config.crm.templateWhatsapp,
    // Se o lead confirmou um horário oferecido de verdade (da agenda real),
    // o CRM cria o evento no Google Calendar do consultor responsável.
    ...(horarioConfirmado
      ? {
          horario_confirmado_gc_id: horarioConfirmado.gcId,
          horario_confirmado_inicio: horarioConfirmado.inicio,
          horario_confirmado_fim: horarioConfirmado.fim,
        }
      : {}),
  };

  const TENTATIVAS = 3;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await fetch(config.crm.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.crm.webhookApiKey ? { "x-api-key": config.crm.webhookApiKey } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!resposta.ok) {
        throw new Error(`CRM respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
      }
      console.log(`[${callId}] webhook do CRM enviado com sucesso (tentativa ${tentativa}).`);
      return { ok: true, payload };
    } catch (err) {
      console.error(`[${callId}] falha ao enviar webhook do CRM (tentativa ${tentativa}/${TENTATIVAS}):`, err.message);
      if (tentativa < TENTATIVAS) await esperar(1000 * tentativa);
    }
  }

  console.error(`[${callId}] webhook do CRM NÃO foi entregue após ${TENTATIVAS} tentativas. Payload:`, payload);
  return { ok: false, payload };
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
