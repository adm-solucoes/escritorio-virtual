export const dynamic = "force-dynamic";

/**
 * Consulta o saldo/crédito restante nas APIs usadas pelo agente de voz
 * outbound. Só Twilio e Deepgram expõem saldo via API pública com a chave
 * de uso normal — Groq não tem endpoint de saldo, e a Cartesia só libera
 * isso via login no painel (não com a X-API-Key de uso), então esses dois
 * ficam marcados como "sem consulta automática" e o usuário confere direto
 * no painel de cada um.
 */
export async function GET() {
  const resultado: Record<string, { disponivel: boolean; valor?: string; moeda?: string; erro?: string; painel?: string }> = {
    twilio: { disponivel: false },
    deepgram: { disponivel: false },
    groq: { disponivel: false, painel: "https://console.groq.com/settings/billing" },
    cartesia: { disponivel: false, painel: "https://play.cartesia.ai" },
  };

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  if (twilioSid && twilioToken) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Balance.json`, {
        headers: { Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64") },
      });
      if (r.ok) {
        const j = await r.json();
        resultado.twilio = { disponivel: true, valor: j.balance, moeda: j.currency };
      } else {
        resultado.twilio = { disponivel: false, erro: `Twilio respondeu ${r.status}` };
      }
    } catch (err) {
      resultado.twilio = { disponivel: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
    }
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (deepgramKey) {
    try {
      const projetos = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: "Token " + deepgramKey },
      }).then((r) => r.json());
      const projectId = projetos.projects?.[0]?.project_id;
      if (projectId) {
        const r = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
          headers: { Authorization: "Token " + deepgramKey },
        });
        if (r.ok) {
          const j = await r.json();
          const saldo = j.balances?.[0];
          resultado.deepgram = { disponivel: true, valor: String(saldo?.amount ?? "?"), moeda: saldo?.units ?? "usd" };
        } else {
          resultado.deepgram = { disponivel: false, erro: `Deepgram respondeu ${r.status}` };
        }
      }
    } catch (err) {
      resultado.deepgram = { disponivel: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
    }
  }

  return Response.json(resultado);
}
