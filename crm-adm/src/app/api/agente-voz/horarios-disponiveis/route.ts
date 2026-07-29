import { createAdminClient } from "@/lib/supabase-admin";
import { listarEventosPeriodo } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/agente-voz/horarios-disponiveis
 *
 * Calcula horários livres (segunda a sexta, 9h-18h, blocos de 1h) olhando a
 * agenda real dos GCs do time comercial que compartilham calendário — mesma
 * fonte que /calendario usa. O agente de voz consulta isso no início de cada
 * ligação pra poder OFERECER um dia/horário concreto pro lead.
 *
 * Cada slot já vem marcado com QUAL gc_id está livre naquele horário (o
 * primeiro comercial sem conflito) — isso é necessário pra depois, quando o
 * lead confirmar um horário, /api/agente-voz/agendar saber em qual agenda
 * Google criar o evento de verdade.
 */
const HORA_INICIO = 9;
const HORA_FIM = 18;
const DIAS_UTEIS_A_OFERECER = 5;
const MAX_SLOTS = 8;

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function formatarSlot(data: Date) {
  const diaSemana = DIAS_SEMANA[data.getDay()];
  const dataFmt = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = data.getHours();
  return `${diaSemana}, ${dataFmt} às ${hora}h`;
}

type EventoOcupado = { inicio: string; fim: string };
type HorarioLivre = { display: string; gcId: string; inicio: string; fim: string };

function calcularSlotsLivres(eventosPorGc: Map<string, EventoOcupado[]>): HorarioLivre[] {
  const slots: HorarioLivre[] = [];
  const agora = new Date();

  for (let d = 0; d < DIAS_UTEIS_A_OFERECER + 4 && slots.length < MAX_SLOTS; d++) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() + d);
    const diaSemana = dia.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // pula fim de semana

    for (let h = HORA_INICIO; h < HORA_FIM && slots.length < MAX_SLOTS; h++) {
      const inicioSlot = new Date(dia);
      inicioSlot.setHours(h, 0, 0, 0);
      const fimSlot = new Date(dia);
      fimSlot.setHours(h + 1, 0, 0, 0);

      if (inicioSlot < agora) continue; // não oferece horário que já passou

      for (const [gcId, ocupados] of eventosPorGc) {
        const conflita = ocupados.some((e) => new Date(e.inicio) < fimSlot && new Date(e.fim) > inicioSlot);
        if (!conflita) {
          slots.push({
            display: formatarSlot(inicioSlot),
            gcId,
            inicio: inicioSlot.toISOString(),
            fim: fimSlot.toISOString(),
          });
          break; // achou um GC livre pra esse horário, não precisa checar os outros
        }
      }
    }
  }

  return slots;
}

export async function GET() {
  try {
    const admin = createAdminClient();
    // Só entra agenda de quem tem papel "comercial" — não pode misturar com
    // outros times (marketing etc), senão o agente oferece horário que na
    // real não é do time que vai atender o briefing.
    const { data: integracoes } = await admin
      .from("integracoes_google")
      .select("gc_id, gcs!inner(role)")
      .eq("compartilhar_agenda", true)
      .eq("gcs.role", "comercial");

    const agora = new Date();
    const fimPeriodo = new Date(agora.getTime() + (DIAS_UTEIS_A_OFERECER + 4) * 86_400_000);

    const eventosPorGc = new Map<string, EventoOcupado[]>();
    for (const integracao of (integracoes as { gc_id: string }[]) ?? []) {
      const resultado = await listarEventosPeriodo(integracao.gc_id, agora.toISOString(), fimPeriodo.toISOString());
      eventosPorGc.set(
        integracao.gc_id,
        resultado.ok ? (resultado.eventos ?? []).map((e) => ({ inicio: e.inicio, fim: e.fim })) : []
      );
    }

    const horarios = calcularSlotsLivres(eventosPorGc);
    return Response.json({ horarios });
  } catch (e) {
    // Se a agenda falhar por qualquer motivo, o agente de voz simplesmente
    // não oferece horário fixo e volta a perguntar de forma aberta — não
    // pode travar a ligação por causa disso.
    return Response.json({ horarios: [], error: e instanceof Error ? e.message : "erro desconhecido" });
  }
}
