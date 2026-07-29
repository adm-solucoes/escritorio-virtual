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
  /** Convidados externos — aceita quantos precisar (antes só tinha 1). */
  participantesEmails?: string[];
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
  const { gcId, titulo, descricao, participantesEmails, inicioISO, fimISO } = opcoes;
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
        attendees: participantesEmails?.length ? participantesEmails.map((email) => ({ email })) : undefined,
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

export interface EventoAgenda {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  linkChamada: string | null;
  linkEvento: string | null;
  /** Nomes/e-mails dos convidados — usado pra achar qual reunião cancelar
   * quando o usuário menciona uma pessoa em vez do horário exato. */
  convidados: string[];
}

/** Lista os eventos entre `inicioISO` e `fimISO` na agenda do GC (usado na agenda compartilhada). */
export async function listarEventosPeriodo(
  gcId: string,
  inicioISO: string,
  fimISO: string
): Promise<{ ok: boolean; eventos?: EventoAgenda[]; error?: string }> {
  const autenticado = await clientAutenticadoParaGc(gcId);
  if ("erro" in autenticado) return { ok: false, error: autenticado.erro };

  try {
    const calendar = google.calendar({ auth: autenticado.client, version: "v3" });

    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: inicioISO,
      timeMax: fimISO,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const eventos: EventoAgenda[] = (data.items ?? [])
      .filter((e) => e.start?.dateTime)
      .map((e) => ({
        id: e.id ?? "",
        titulo: e.summary ?? "(sem título)",
        inicio: e.start!.dateTime!,
        fim: e.end?.dateTime ?? e.start!.dateTime!,
        linkChamada: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null,
        linkEvento: e.htmlLink ?? null,
        convidados: (e.attendees ?? []).map((a) => a.displayName ?? a.email ?? "").filter(Boolean),
      }));

    return { ok: true, eventos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao listar eventos do Google Calendar" };
  }
}

interface AtualizarEventoOpcoes {
  gcId: string;
  eventoId: string;
  titulo?: string;
  inicioISO?: string;
  fimISO?: string;
}

/** Atualiza horário e/ou título de um evento existente — usado pelo editar e pelo
 * arrastar-pra-remarcar da grade semanal. */
export async function atualizarEvento(opcoes: AtualizarEventoOpcoes): Promise<ResultadoEvento> {
  const { gcId, eventoId, titulo, inicioISO, fimISO } = opcoes;
  const autenticado = await clientAutenticadoParaGc(gcId);
  if ("erro" in autenticado) return { ok: false, error: autenticado.erro };

  try {
    const calendar = google.calendar({ auth: autenticado.client, version: "v3" });
    const { data: evento } = await calendar.events.patch({
      calendarId: "primary",
      eventId: eventoId,
      sendUpdates: "all",
      requestBody: {
        ...(titulo ? { summary: titulo } : {}),
        ...(inicioISO ? { start: { dateTime: inicioISO } } : {}),
        ...(fimISO ? { end: { dateTime: fimISO } } : {}),
      },
    });

    return {
      ok: true,
      eventoId: evento.id ?? undefined,
      linkEvento: evento.htmlLink ?? undefined,
      linkChamada: evento.hangoutLink ?? evento.conferenceData?.entryPoints?.[0]?.uri ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao atualizar evento no Google Calendar" };
  }
}

/** Exclui um evento — usado pelo botão de excluir no modal de detalhe. */
export async function excluirEvento(gcId: string, eventoId: string): Promise<{ ok: boolean; error?: string }> {
  const autenticado = await clientAutenticadoParaGc(gcId);
  if ("erro" in autenticado) return { ok: false, error: autenticado.erro };

  try {
    const calendar = google.calendar({ auth: autenticado.client, version: "v3" });
    await calendar.events.delete({ calendarId: "primary", eventId: eventoId, sendUpdates: "all" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao excluir evento no Google Calendar" };
  }
}
