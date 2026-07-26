// Motor de execução das automações — roda por cron (gatilhos de tempo) e é chamado também
// a partir de rotas que disparam gatilhos de evento (mudança de etapa, etc).
// Regras fixas, sem IA: cada nó sabe exatamente o que fazer a partir do `config` salvo no canvas.

import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail, montarEmailConfirmacaoReuniao } from "@/lib/email";
import { criarEventoReuniao } from "@/lib/google-calendar";
import { enviarWhatsappGenerico } from "@/lib/whatsapp-envio";
import type { AutomacaoConexao, AutomacaoNo, Empresa, EtapaFunil, Oportunidade } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

interface Alvo {
  empresaId: string | null;
  oportunidadeId: string | null;
  atividadeId: string | null;
  nomeEmpresa: string | null;
  telefone: string | null;
  emailContato: string | null;
  gcResponsavelId: string | null;
}

function hojeISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function jaExecutado(admin: AdminClient, automacaoId: string, noId: string, alvo: Alvo) {
  let query = admin
    .from("automacao_execucoes")
    .select("id")
    .eq("automacao_id", automacaoId)
    .eq("no_id", noId)
    .eq("resultado", "sucesso");

  query = alvo.empresaId ? query.eq("empresa_id", alvo.empresaId) : query.is("empresa_id", null);
  query = alvo.oportunidadeId ? query.eq("oportunidade_id", alvo.oportunidadeId) : query.is("oportunidade_id", null);
  query = alvo.atividadeId ? query.eq("atividade_id", alvo.atividadeId) : query.is("atividade_id", null);

  const { data } = await query.maybeSingle();
  return Boolean(data);
}

async function registrarExecucao(
  admin: AdminClient,
  automacaoId: string,
  noId: string,
  alvo: Alvo,
  resultado: "sucesso" | "erro" | "ignorado",
  erro?: string
) {
  await admin.from("automacao_execucoes").insert({
    automacao_id: automacaoId,
    empresa_id: alvo.empresaId,
    oportunidade_id: alvo.oportunidadeId,
    atividade_id: alvo.atividadeId,
    no_id: noId,
    resultado,
    erro: erro ?? null,
  });
}

// ---------- Encontrar alvos de cada tipo de gatilho ----------

async function encontrarAlvosGatilhoEtapa(admin: AdminClient, etapa: EtapaFunil): Promise<Alvo[]> {
  const { data } = await admin
    .from("oportunidades")
    .select("*, empresas(*)")
    .eq("etapa_atual", etapa)
    .eq("pausar_automacoes", false);

  return ((data as (Oportunidade & { empresas: Empresa })[]) ?? []).map((o) => ({
    empresaId: o.empresa_id,
    oportunidadeId: o.id,
    atividadeId: null,
    nomeEmpresa: o.empresas?.nome_empresa ?? null,
    telefone: o.empresas?.telefone ?? null,
    emailContato: o.empresas?.email ?? null,
    gcResponsavelId: o.gc_responsavel_id,
  }));
}

async function encontrarAlvosAtividadeAtrasada(admin: AdminClient): Promise<Alvo[]> {
  const { data } = await admin
    .from("atividades")
    .select("*, empresas(*), oportunidades(pausar_automacoes)")
    .neq("status", "Concluído")
    .lt("prazo", hojeISODate());

  return (
    (
      (data as {
        id: string;
        empresa_id: string | null;
        oportunidade_id: string | null;
        responsavel_id: string | null;
        empresas: Empresa | null;
        oportunidades: { pausar_automacoes: boolean } | null;
      }[]) ?? []
    )
      .filter((a) => !a.oportunidades?.pausar_automacoes)
      .map((a) => ({
        empresaId: a.empresa_id,
        oportunidadeId: a.oportunidade_id,
        atividadeId: a.id,
        nomeEmpresa: a.empresas?.nome_empresa ?? null,
        telefone: a.empresas?.telefone ?? null,
        emailContato: a.empresas?.email ?? null,
        gcResponsavelId: a.responsavel_id,
      }))
  );
}

async function encontrarAlvosSemContato(admin: AdminClient, dias: number): Promise<Alvo[]> {
  const { data } = await admin
    .from("oportunidades")
    .select("*, empresas(*)")
    .eq("pausar_automacoes", false)
    .not("ultima_interacao", "is", null)
    .not("etapa_atual", "in", '("Contrato Fechado","Perdido","Renovação")');

  const agora = Date.now();
  return (((data as (Oportunidade & { empresas: Empresa })[]) ?? [])
    .filter((o) => o.ultima_interacao && (agora - new Date(o.ultima_interacao).getTime()) / 86400000 >= dias)
    .map((o) => ({
      empresaId: o.empresa_id,
      oportunidadeId: o.id,
      atividadeId: null,
      nomeEmpresa: o.empresas?.nome_empresa ?? null,
      telefone: o.empresas?.telefone ?? null,
      emailContato: o.empresas?.email ?? null,
      gcResponsavelId: o.gc_responsavel_id,
    })));
}

async function encontrarAlvosRenovacaoProxima(admin: AdminClient, diasAntes: number): Promise<Alvo[]> {
  const { data } = await admin
    .from("oportunidades")
    .select("*, empresas(*)")
    .eq("pausar_automacoes", false)
    .not("data_renovacao", "is", null);

  const hoje = new Date();
  return ((data as (Oportunidade & { empresas: Empresa })[]) ?? [])
    .filter((o) => {
      const diasRestantes = (new Date(o.data_renovacao!).getTime() - hoje.getTime()) / 86400000;
      return diasRestantes >= 0 && diasRestantes <= diasAntes;
    })
    .map((o) => ({
      empresaId: o.empresa_id,
      oportunidadeId: o.id,
      atividadeId: null,
      nomeEmpresa: o.empresas?.nome_empresa ?? null,
      telefone: o.empresas?.telefone ?? null,
      emailContato: o.empresas?.email ?? null,
      gcResponsavelId: o.gc_responsavel_id,
    }));
}

function alvoVazio(): Alvo {
  return {
    empresaId: null,
    oportunidadeId: null,
    atividadeId: null,
    nomeEmpresa: null,
    telefone: null,
    emailContato: null,
    gcResponsavelId: null,
  };
}

async function encontrarAlvos(admin: AdminClient, gatilho: AutomacaoNo): Promise<Alvo[]> {
  const config = gatilho.config as Record<string, unknown>;
  switch (gatilho.tipo) {
    case "gatilho_etapa":
      return typeof config.etapa === "string" ? encontrarAlvosGatilhoEtapa(admin, config.etapa as EtapaFunil) : [];
    case "gatilho_atividade_atrasada":
      return encontrarAlvosAtividadeAtrasada(admin);
    case "gatilho_sem_contato":
      return typeof config.dias === "number" ? encontrarAlvosSemContato(admin, config.dias) : [];
    case "gatilho_data_hora": {
      if (typeof config.dataHora !== "string") return [];
      return new Date(config.dataHora).getTime() <= Date.now() ? [alvoVazio()] : [];
    }
    case "gatilho_renovacao_proxima":
      return encontrarAlvosRenovacaoProxima(admin, typeof config.diasAntes === "number" ? config.diasAntes : 30);
    default:
      return [];
  }
}

// ---------- Avaliação de condição ----------

function avaliarCondicao(config: Record<string, unknown>, oportunidade: Oportunidade | null): boolean {
  const campo = config.campo as string | undefined;
  const operador = config.operador as string | undefined;
  const valor = config.valor as string | undefined;
  if (!campo || !operador || valor === undefined || !oportunidade) return false;

  const atual = campo === "valor_estimado" ? oportunidade.valor_estimado ?? 0 : (oportunidade as unknown as Record<string, unknown>)[campo];

  if (campo === "valor_estimado") {
    const alvoNum = Number(valor);
    const atualNum = Number(atual);
    if (operador === ">") return atualNum > alvoNum;
    if (operador === "<") return atualNum < alvoNum;
    if (operador === "=") return atualNum === alvoNum;
    return atualNum !== alvoNum;
  }

  if (operador === "=") return atual === valor;
  if (operador === "!=") return atual !== valor;
  return false;
}

// ---------- Execução das ações ----------

async function executarAcaoWhatsapp(config: Record<string, unknown>, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  const resultado = await enviarWhatsappGenerico(alvo.telefone, alvo.empresaId, {
    modo: config.modo === "template" ? "template" : "texto",
    texto: typeof config.texto === "string" ? config.texto : undefined,
    templateNome: typeof config.templateNome === "string" ? config.templateNome : undefined,
    templateIdioma: typeof config.templateIdioma === "string" ? config.templateIdioma : undefined,
  });
  return resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro };
}

function proximoHorarioComercial(horarioPadrao: string, diasUteis: boolean, duracaoMinutos: number) {
  const [hh, mm] = horarioPadrao.split(":").map(Number);
  const inicio = new Date();
  inicio.setDate(inicio.getDate() + 1);
  inicio.setHours(hh || 10, mm || 0, 0, 0);

  if (diasUteis) {
    while (inicio.getDay() === 0 || inicio.getDay() === 6) {
      inicio.setDate(inicio.getDate() + 1);
    }
  }

  const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);
  return { inicio, fim };
}

async function executarAcaoAgendarReuniao(config: Record<string, unknown>, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  if (!alvo.gcResponsavelId) return { ok: false, erro: "Oportunidade sem GC responsável" };

  const duracaoMinutos = typeof config.duracaoMinutos === "number" ? config.duracaoMinutos : 30;
  const horarioPadrao = typeof config.horarioPadrao === "string" ? config.horarioPadrao : "10:00";
  const diasUteis = config.diasUteis !== false;
  const { inicio, fim } = proximoHorarioComercial(horarioPadrao, diasUteis, duracaoMinutos);

  const titulo = String(config.tituloTemplate ?? "Reunião com {empresa}").replace("{empresa}", alvo.nomeEmpresa ?? "cliente");

  const resultado = await criarEventoReuniao({
    gcId: alvo.gcResponsavelId,
    titulo,
    descricao: typeof config.descricaoTemplate === "string" ? config.descricaoTemplate : undefined,
    participanteEmail: alvo.emailContato,
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
  });

  if (!resultado.ok) return { ok: false, erro: resultado.error };

  if (alvo.emailContato) {
    await enviarEmail({
      para: [alvo.emailContato],
      assunto: `Reunião agendada · ${alvo.nomeEmpresa ?? "ADM Soluções"}`,
      html: montarEmailConfirmacaoReuniao({
        nomeEmpresa: alvo.nomeEmpresa ?? "cliente",
        dataHora: inicio.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" }),
        linkChamada: resultado.linkChamada ?? null,
        nomeGc: "ADM Soluções",
      }),
    });
  }

  return { ok: true };
}

async function executarAcaoCriarAtividade(admin: AdminClient, config: Record<string, unknown>, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  const prazoDias = typeof config.prazoDias === "number" ? config.prazoDias : 0;
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + prazoDias);

  const { error } = await admin.from("atividades").insert({
    empresa_id: alvo.empresaId,
    oportunidade_id: alvo.oportunidadeId,
    tipo_atividade: String(config.tipoAtividade ?? "Follow-up automático"),
    responsavel_id: alvo.gcResponsavelId,
    status: "Pendente",
    prazo: prazo.toISOString().slice(0, 10),
    alerta_disparado: true,
  });

  return error ? { ok: false, erro: error.message } : { ok: true };
}

async function executarAcaoNotificarInterno(admin: AdminClient, config: Record<string, unknown>, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await admin.from("atividades").insert({
    empresa_id: alvo.empresaId,
    oportunidade_id: alvo.oportunidadeId,
    tipo_atividade: `🔔 ${config.mensagem ?? "Aviso da automação"}`,
    responsavel_id: alvo.gcResponsavelId,
    status: "Pendente",
    prazo: hojeISODate(),
    alerta_disparado: true,
  });

  return error ? { ok: false, erro: error.message } : { ok: true };
}

async function executarAcaoEmail(config: Record<string, unknown>, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  if (!alvo.emailContato) return { ok: false, erro: "Empresa sem e-mail cadastrado" };
  const nome = alvo.nomeEmpresa ?? "cliente";
  const assunto = String(config.assunto ?? "").replace("{empresa}", nome);
  const corpoHtml = String(config.corpoHtml ?? "").replace(/\{empresa\}/g, nome);
  const resultado = await enviarEmail({ para: [alvo.emailContato], assunto, html: `<div>${corpoHtml}</div>` });
  return resultado.ok ? { ok: true } : { ok: false, erro: resultado.error };
}

async function executarAcaoAlertarRenovacao(admin: AdminClient, alvo: Alvo): Promise<{ ok: boolean; erro?: string }> {
  if (!alvo.gcResponsavelId) return { ok: false, erro: "Oportunidade sem GC responsável" };

  const { data: gc } = await admin.from("gcs").select("email, nome").eq("id", alvo.gcResponsavelId).maybeSingle();

  const { error: erroAtividade } = await admin.from("atividades").insert({
    empresa_id: alvo.empresaId,
    oportunidade_id: alvo.oportunidadeId,
    tipo_atividade: `🔔 Renovação de ${alvo.nomeEmpresa ?? "cliente"} se aproximando`,
    responsavel_id: alvo.gcResponsavelId,
    status: "Pendente",
    prazo: hojeISODate(),
    alerta_disparado: true,
  });
  if (erroAtividade) return { ok: false, erro: erroAtividade.message };

  // A notificação interna já foi criada acima e é o canal principal — se o e-mail falhar,
  // não desfaz isso nem marca a ação inteira como erro (senão o motor tentaria de novo no
  // próximo dia e duplicaria a notificação interna).
  if (gc?.email) {
    await enviarEmail({
      para: [gc.email],
      assunto: `Renovação se aproximando · ${alvo.nomeEmpresa ?? "cliente"}`,
      html: `<p>Olá${gc.nome ? ` ${gc.nome}` : ""}, a renovação de <strong>${alvo.nomeEmpresa ?? "cliente"}</strong> está se aproximando. Confira a oportunidade no CRM.</p>`,
    });
  }

  return { ok: true };
}

// ---------- Percorrer a cadeia de nós a partir de um gatilho, pra um alvo específico ----------

async function processarNo(
  admin: AdminClient,
  automacaoId: string,
  nosPorId: Map<string, AutomacaoNo>,
  conexoes: AutomacaoConexao[],
  noId: string,
  alvo: Alvo,
  oportunidade: Oportunidade | null
) {
  const no = nosPorId.get(noId);
  if (!no) return;

  const filhas = (condicao?: string | null) =>
    conexoes.filter((c) => c.no_origem_id === noId && (condicao === undefined || c.condicao === condicao));

  if (no.tipo.startsWith("gatilho_")) {
    for (const conexao of filhas()) {
      await processarNo(admin, automacaoId, nosPorId, conexoes, conexao.no_destino_id, alvo, oportunidade);
    }
    return;
  }

  if (no.tipo === "condicao") {
    const passou = avaliarCondicao(no.config, oportunidade);
    for (const conexao of filhas(passou ? "sim" : "nao")) {
      await processarNo(admin, automacaoId, nosPorId, conexoes, conexao.no_destino_id, alvo, oportunidade);
    }
    return;
  }

  if (no.tipo === "espera") {
    const { data: logEspera } = await admin
      .from("automacao_execucoes")
      .select("executado_em")
      .eq("automacao_id", automacaoId)
      .eq("no_id", no.id)
      .eq("resultado", "sucesso")
      .eq("empresa_id", alvo.empresaId ?? "")
      .maybeSingle();

    if (!logEspera) {
      await registrarExecucao(admin, automacaoId, no.id, alvo, "sucesso");
      return;
    }

    const quantidade = typeof no.config.quantidade === "number" ? no.config.quantidade : 1;
    const unidade = no.config.unidade === "horas" ? 3_600_000 : 86_400_000;
    const jaEsperouBastante = Date.now() - new Date(logEspera.executado_em).getTime() >= quantidade * unidade;
    if (!jaEsperouBastante) return;

    for (const conexao of filhas()) {
      await processarNo(admin, automacaoId, nosPorId, conexoes, conexao.no_destino_id, alvo, oportunidade);
    }
    return;
  }

  // nó de ação: se já rodou com sucesso pra esse alvo, não repete — mas segue adiante
  // (o próximo nó tem sua própria verificação de idempotência).
  const executado = await jaExecutado(admin, automacaoId, no.id, alvo);
  if (!executado) {
    let resultado: { ok: boolean; erro?: string };
    try {
      if (no.tipo === "acao_whatsapp") resultado = await executarAcaoWhatsapp(no.config, alvo);
      else if (no.tipo === "acao_agendar_reuniao") resultado = await executarAcaoAgendarReuniao(no.config, alvo);
      else if (no.tipo === "acao_criar_atividade") resultado = await executarAcaoCriarAtividade(admin, no.config, alvo);
      else if (no.tipo === "acao_notificar_interno") resultado = await executarAcaoNotificarInterno(admin, no.config, alvo);
      else if (no.tipo === "acao_email") resultado = await executarAcaoEmail(no.config, alvo);
      else if (no.tipo === "acao_alertar_renovacao") resultado = await executarAcaoAlertarRenovacao(admin, alvo);
      else resultado = { ok: false, erro: `Tipo de nó desconhecido: ${no.tipo}` };
    } catch (e) {
      resultado = { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido" };
    }

    await registrarExecucao(admin, automacaoId, no.id, alvo, resultado.ok ? "sucesso" : "erro", resultado.erro);
    // falha numa ação não trava o fluxo inteiro: registra o erro e simplesmente não avança
    // essa ramificação específica, mas outras automações/alvos continuam normalmente.
    if (!resultado.ok) return;
  }

  for (const conexao of filhas()) {
    await processarNo(admin, automacaoId, nosPorId, conexoes, conexao.no_destino_id, alvo, oportunidade);
  }
}

export async function executarAutomacoesAtivas(): Promise<{ automacoesProcessadas: number }> {
  const admin = createAdminClient();
  const { data: automacoes } = await admin.from("automacoes").select("*").eq("status", "ativa");

  for (const automacao of automacoes ?? []) {
    const [{ data: nos }, { data: conexoes }] = await Promise.all([
      admin.from("automacao_nos").select("*").eq("automacao_id", automacao.id),
      admin.from("automacao_conexoes").select("*").eq("automacao_id", automacao.id),
    ]);

    const nosPorId = new Map<string, AutomacaoNo>((nos ?? []).map((n) => [n.id, n as AutomacaoNo]));
    const gatilhos = (nos ?? []).filter((n) => n.tipo.startsWith("gatilho_")) as AutomacaoNo[];

    for (const gatilho of gatilhos) {
      const alvos = await encontrarAlvos(admin, gatilho);
      for (const alvo of alvos) {
        let oportunidade: Oportunidade | null = null;
        if (alvo.oportunidadeId) {
          const { data } = await admin.from("oportunidades").select("*").eq("id", alvo.oportunidadeId).maybeSingle();
          oportunidade = (data as Oportunidade) ?? null;
        }
        await processarNo(admin, automacao.id, nosPorId, (conexoes as AutomacaoConexao[]) ?? [], gatilho.id, alvo, oportunidade);
      }
    }
  }

  return { automacoesProcessadas: (automacoes ?? []).length };
}
