// Integração com o Google Calendar do próprio GC (OAuth individual — cada GC conecta a
// conta Google com o mesmo e-mail que usa pra logar no CRM). Nunca expor tokens no client.

import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase-admin";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"];

function oauthClientBase() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados");
  return new google.auth.OAuth2(clientId, clientSecret, `${siteUrl}/api/google/callback`);
}

/** Gera a URL de consentimento do Google pro GC autorizar o CRM (Calendar). */
export function gerarUrlAutorizacaoGoogle(gcId: string) {
  const client = oauthClientBase();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: gcId,
  });
}

/** Troca o "code" do callback do Google pelos tokens e descobre o e-mail conectado. */
export async function trocarCodigoPorTokens(code: string) {
  const client = oauthClientBase();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: perfil } = await oauth2.userinfo.get();

  return {
    email: perfil.email ?? "",
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    expiraEm: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600_000).toISOString(),
  };
}

/** Monta um client OAuth já autenticado com o token salvo do GC, renovando e persistindo
 * automaticamente quando o Google emitir um access_token novo. */
async function clientAutenticadoParaGc(gcId: string) {
  const admin = createAdminClient();
  const { data: integracao } = await admin.from("integracoes_google").select("*").eq("gc_id", gcId).maybeSingle();
  if (!integracao) return { erro: "Esse GC ainda não conectou a conta Google em Configurações." };

  const client = oauthClientBase();
  client.setCredentials({
    access_token: integracao.access_token,
    refresh_token: integracao.refresh_token,
    expiry_date: new Date(integracao.expira_em).getTime(),
  });

  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    admin
      .from("integracoes_google")
      .update({
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        expira_em: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600_000).toISOString(),
      })
      .eq("gc_id", gcId)
      .then(() => {});
  });

  return { client };
}

interface CriarEventoOpcoes {
  gcId: string;
  titulo: string;
  descricao?: string;
  participanteEmail?: string | null;
  inicioISO: string;
  fimISO: string;
}

interface ResultadoEvento {
  ok: boolean;
  eventoId?: string;
  linkEvento?: string;
  linkChamada?: string | null;
  error?: string;
}

/** Cria um evento no Google Calendar do GC responsável, com Google Meet automático. */
export async function criarEventoReuniao(opcoes: CriarEventoOpcoes): Promise<ResultadoEvento> {
  const { gcId, titulo, descricao, participanteEmail, inicioISO, fimISO } = opcoes;
  const autenticado = await clientAutenticadoParaGc(gcId);
  if ("erro" in autenticado) return { ok: false, error: autenticado.erro };

  try {
    const calendar = google.calendar({ auth: autenticado.client, version: "v3" });
    const requestId = crypto.randomUUID();

    const { data: evento } = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: titulo,
        description: descricao,
        start: { dateTime: inicioISO },
        end: { dateTime: fimISO },
        attendees: participanteEmail ? [{ email: participanteEmail }] : undefined,
        conferenceData: {
          createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });

    return {
      ok: true,
      eventoId: evento.id ?? undefined,
      linkEvento: evento.htmlLink ?? undefined,
      linkChamada: evento.hangoutLink ?? evento.conferenceData?.entryPoints?.[0]?.uri ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar evento no Google Calendar" };
  }
}
