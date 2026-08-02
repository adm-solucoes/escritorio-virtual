import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { lerCorpoValidado, textoLivre } from "@/lib/validacao";
import { chamarClaude } from "@/lib/ai";
import { detectarPedidoDeAgendamento, detectarPedidoDeCancelamento, type DeteccaoCancelamento } from "@/lib/assistente-agendamento";
import { listarEventosPeriodo, type EventoAgenda } from "@/lib/google-calendar";
import type { Empresa, Gc, Oportunidade } from "@/lib/types";

// Teto de 4000 caracteres: a pergunta vai no prompt do Claude, então tamanho
// aqui é custo direto em token. Uma pergunta real do time nunca chega perto.
const schemaPergunta = z.object({ pergunta: textoLivre(4000).min(1) });

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Acha, entre os eventos do próprio usuário, quais batem com o pedido de
 * cancelamento — sem data/hora/nome suficientes pra saber qual é "a"
 * reunião, mostra os próximos compromissos pra pessoa escolher em vez de
 * adivinhar e cancelar a errada. */
function candidatosParaCancelar(eventos: EventoAgenda[], deteccao: DeteccaoCancelamento): EventoAgenda[] {
  let restantes = eventos;

  if (deteccao.dataISO) {
    restantes = restantes.filter(
      (e) => new Date(e.inicio).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === deteccao.dataISO
    );
  }

  const pontuados = restantes.map((evento) => {
    let pontos = 0;
    if (deteccao.hora) {
      const horaLocal = new Date(evento.inicio).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Sao_Paulo",
      });
      if (horaLocal === deteccao.hora) pontos += 3;
    }
    const textoAlvo = normalizar(`${evento.titulo} ${evento.convidados.join(" ")}`);
    if (deteccao.participanteNome && textoAlvo.includes(normalizar(deteccao.participanteNome))) pontos += 2;
    if (deteccao.pista && textoAlvo.includes(normalizar(deteccao.pista))) pontos += 2;
    return { evento, pontos };
  });

  pontuados.sort((a, b) => b.pontos - a.pontos || new Date(a.evento.inicio).getTime() - new Date(b.evento.inicio).getTime());
  return pontuados.slice(0, 5).map((p) => p.evento);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function montarContexto(empresas: Empresa[], oportunidades: (Oportunidade & { empresas?: Empresa })[], gcs: Gc[]) {
  const nomeGc = new Map(gcs.map((g) => [g.id, g.nome]));
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome_empresa]));

  const linhasOportunidades = oportunidades.map((o) => {
    const dias = Math.floor((Date.now() - new Date(o.atualizado_em).getTime()) / 86400000);
    return [
      `Empresa: ${nomeEmpresa.get(o.empresa_id) ?? "?"}`,
      `Projeto: ${o.projeto ?? "—"}`,
      `Pipeline: ${o.tipo_pipeline}`,
      `Etapa: ${o.etapa_atual}`,
      `Valor: ${o.valor_estimado ?? 0}`,
      `Dias desde última atualização: ${dias}`,
      `Próxima ação: ${o.proxima_acao ?? "não definida"}`,
      o.motivo_perda ? `Motivo de perda: ${o.motivo_perda}` : null,
      `GC responsável: ${o.gc_responsavel_id ? nomeGc.get(o.gc_responsavel_id) ?? "?" : "sem responsável"}`,
    ]
      .filter(Boolean)
      .join(" | ");
  });

  const linhasEmpresas = empresas.map((e) =>
    [
      `Empresa: ${e.nome_empresa}`,
      `Segmento: ${e.segmento ?? "—"}`,
      `Cidade: ${e.cidade ?? "—"}`,
      `ICP: ${e.icp ?? "—"}`,
      `Temperatura: ${e.temperatura ?? "—"}`,
      `GC responsável: ${e.gc_responsavel_id ? nomeGc.get(e.gc_responsavel_id) ?? "?" : "sem responsável"}`,
    ].join(" | ")
  );

  return `EMPRESAS (${linhasEmpresas.length}):\n${linhasEmpresas.join("\n")}\n\nOPORTUNIDADES (${linhasOportunidades.length}):\n${linhasOportunidades.join("\n")}`;
}

export async function POST(request: Request) {
  const corpo = await lerCorpoValidado(request, schemaPergunta);
  if (!corpo.ok) return corpo.resposta;
  const { pergunta } = corpo.dados;
  if (!pergunta.trim()) {
    return Response.json({ error: "Pergunta vazia" }, { status: 400 });
  }

  // gcId NUNCA vem do corpo da requisição — só do cookie de sessão de
  // verdade. Antes o cliente mandava o gcId direto e o servidor confiava
  // cegamente, o que deixaria qualquer pessoa agir na agenda de outra só
  // trocando o valor enviado. Cada usuário só consegue agir na própria
  // agenda agora, sempre.
  const supabaseSessao = await createServerClient();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: gcAtual } = await admin.from("gcs").select("*").eq("email", user.email).maybeSingle();
  if (!gcAtual || gcAtual.role === "sem_acesso") {
    return Response.json({ error: "Sem acesso a dados comerciais." }, { status: 403 });
  }
  const gcId = gcAtual.id;

  // Time interno pra reconhecer nome → e-mail automaticamente ao marcar
  // reunião (ex: "marca com a Isabelle" já resolve o e-mail sozinho, sem
  // precisar digitar). Usa o e-mail REAL conectado no Google Calendar
  // (integracoes_google.email_google) quando existir — é o que faz a
  // reunião aparecer na agenda da pessoa de verdade; pode ser diferente do
  // e-mail cadastrado no CRM (ex: alguém conectou uma conta compartilhada).
  const [{ data: todosGcs }, { data: integracoesGoogle }] = await Promise.all([
    admin.from("gcs").select("id, nome, email"),
    admin.from("integracoes_google").select("gc_id, email_google"),
  ]);
  const emailGooglePorGc = new Map((integracoesGoogle ?? []).map((i) => [i.gc_id, i.email_google as string]));
  const membrosEquipe = (todosGcs ?? []).map((g) => ({
    nome: g.nome as string,
    email: emailGooglePorGc.get(g.id) ?? (g.email as string),
  }));

  // Passo separado (antes da resposta normal): detecta se é um pedido de
  // agendamento. Só propõe (nunca cria sozinho) quando já tem data+hora — se
  // faltar informação, cai pro fluxo de chat normal abaixo, que pede o que
  // falta em linguagem natural.
  const deteccao = await detectarPedidoDeAgendamento(pergunta, membrosEquipe).catch(() => null);
  if (deteccao?.agendamento && deteccao.dataISO && deteccao.hora) {
    const { data: integracao } = await admin.from("integracoes_google").select("id").eq("gc_id", gcId).maybeSingle();
    if (!integracao) {
      return Response.json({
        resposta:
          "Encontrei seu pedido de reunião, mas sua conta Google ainda não está conectada. Conecte em Configurações → Google Calendar e peça de novo.",
      });
    }
    return Response.json({
      propostaReuniao: {
        participanteNome: deteccao.participanteNome,
        participantesEmails: deteccao.participantesEmails ?? [],
        assunto: deteccao.assunto ?? "Reunião",
        dataISO: deteccao.dataISO,
        hora: deteccao.hora,
        duracaoMinutos: deteccao.duracaoMinutos ?? 30,
      },
    });
  }

  // Mesma lógica pra CANCELAR: detecta a intenção, busca candidatos reais
  // na agenda do usuário e devolve pra escolher — nunca cancela sozinho.
  const deteccaoCancelamento = await detectarPedidoDeCancelamento(pergunta).catch(() => null);
  if (deteccaoCancelamento?.cancelamento) {
    const agora = new Date();
    const daqui30dias = new Date(agora.getTime() + 30 * 86_400_000);
    const resultadoEventos = await listarEventosPeriodo(gcId, agora.toISOString(), daqui30dias.toISOString());

    if (!resultadoEventos.ok) {
      return Response.json({
        resposta: `Encontrei seu pedido de cancelamento, mas não consegui acessar sua agenda: ${resultadoEventos.error}`,
      });
    }

    const candidatos = candidatosParaCancelar(resultadoEventos.eventos ?? [], deteccaoCancelamento);
    if (candidatos.length === 0) {
      return Response.json({
        resposta: "Não achei nenhuma reunião nos próximos 30 dias que bata com isso. Pode me dar mais detalhes (data, horário ou com quem é)?",
      });
    }

    return Response.json({ propostaCancelamento: { eventos: candidatos } });
  }

  const [{ data: empresasData }, { data: oportunidadesData }, { data: gcsData }] = await Promise.all([
    admin.from("empresas").select("*"),
    admin.from("oportunidades").select("*"),
    admin.from("gcs").select("*"),
  ]);

  const souComercial = gcAtual.role === "comercial";
  const empresas = ((empresasData as Empresa[]) ?? []).filter((e) => !souComercial || e.gc_responsavel_id === gcId);
  const oportunidades = ((oportunidadesData as Oportunidade[]) ?? []).filter(
    (o) => !souComercial || o.gc_responsavel_id === gcId
  );
  const gcs = (gcsData as Gc[]) ?? [];

  const contexto = montarContexto(empresas, oportunidades, gcs);
  const equipeTexto = membrosEquipe.map((m) => `${m.nome} <${m.email}>`).join("\n");

  // Configuração editável em /agentes-ia — nome/instrução extra/uso de emoji
  // do assistente. Se a linha não existir ainda (migration não rodada), usa
  // o comportamento padrão sem quebrar nada.
  const { data: configAgente } = await admin
    .from("agentes_ia")
    .select("instrucoes_extra, usar_emojis")
    .eq("chave", "assistente-chat")
    .maybeSingle();

  const system = `Você é um assistente comercial interno da ADM Soluções, uma empresa júnior de consultoria. Para perguntas sobre o pipeline, empresas, oportunidades e a equipe, responda usando SOMENTE os dados fornecidos abaixo — nunca invente números, valores, etapas ou e-mails que não estão na lista.

Você também tem uma ferramenta de busca na web. Use-a quando o usuário pedir pra pesquisar informações externas sobre uma empresa (notícias recentes, site, LinkedIn, o que a empresa faz) — nesse caso, busque de verdade e cite as fontes. Não use a busca pra perguntas sobre os dados internos do pipeline.

Você TEM acesso à agenda (Google Calendar) do usuário, tanto pra marcar quanto pra cancelar reunião — não diga que não tem essa ferramenta. Os dois fluxos são tratados por um passo separado antes de chegar até você; se você está respondendo esta pergunta, é porque não era um pedido de agendar/cancelar, ou faltou informação nele. Se parecer um pedido de reunião incompleto (marcar ou cancelar), pergunte objetivamente o que falta (com quem, que dia, que horário) — quando a pessoa responder com isso, o pedido é detectado automaticamente e vira uma proposta pra confirmar.

Seja direto e específico — cite nomes de empresas, valores e números reais. Se não tiver a informação (nem nos dados internos nem via busca), diga claramente que não tem. Responda em português, de forma objetiva e curta — no máximo uns 8-10 tópicos ou parágrafos curtos, sem repetir a mesma informação de formas diferentes.

${configAgente?.usar_emojis ? "Pode usar emoji com moderação quando fizer sentido." : "Não use emoji nas respostas."}
${configAgente?.instrucoes_extra ? `\nINSTRUÇÃO ADICIONAL (definida pelo gestor):\n${configAgente.instrucoes_extra}\n` : ""}

EQUIPE (nome <e-mail>):
${equipeTexto}

DADOS INTERNOS DO PIPELINE:
${contexto}`;

  const resultado = await chamarClaude({
    tarefa: "redigir",
    origem: "assistente-chat",
    system,
    mensagem: pergunta,
    maxTokens: 700,
    permitirBuscaWeb: true,
    timeoutMs: 45_000,
  });

  if (!resultado.ok) {
    return Response.json({ error: resultado.erro }, { status: 200 });
  }

  return Response.json({ resposta: resultado.texto });
}
