import { createAdminClient } from "@/lib/supabase-admin";
import { criarEventoReuniao } from "@/lib/google-calendar";
import { enviarEmail, montarEmailConfirmacaoReuniao } from "@/lib/email";
import { enviarWhatsappGenerico } from "@/lib/whatsapp-envio";
import { normalizarTelefoneE164 } from "@/lib/whatsapp";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

const DURACAO_MINUTOS = 30;

interface CorpoRequisicao {
  gcId: string;
  nome: string;
  email: string;
  telefone: string | null;
  dataISO: string;
  hora: string;
  motivo: string;
  empresaId?: string | null;
  criarNovaEmpresa?: boolean;
}

interface ResultadoCanal {
  ok: boolean;
  erro?: string;
}

async function registrarLog(
  admin: ReturnType<typeof createAdminClient>,
  dados: {
    contatoId: string | null;
    empresaId: string | null;
    atividadeId: string | null;
    canal: "calendario" | "email" | "whatsapp";
    resultado: ResultadoCanal;
  }
) {
  await admin.from("acao_rapida_execucoes").insert({
    contato_id: dados.contatoId,
    empresa_id: dados.empresaId,
    atividade_id: dados.atividadeId,
    canal: dados.canal,
    resultado: dados.resultado.ok ? "sucesso" : "erro",
    detalhes: dados.resultado.erro ?? null,
  });
}

export async function POST(request: Request) {
  // Exige login e usa o GC da sessão como responsável — antes agia sem
  // autenticação e confiando no gcId do corpo (dava pra agendar em nome de
  // qualquer GC e disparar e-mail/WhatsApp de confirmação sem estar logado).
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  const gcId = sessao.gc.id;

  try {
    const corpo: CorpoRequisicao = await request.json();
    const { nome, email, telefone, dataISO, hora, motivo } = corpo;

    if (!nome || !email || !dataISO || !hora || !motivo) {
      return Response.json({ error: "Faltam campos obrigatórios (nome, e-mail, data, hora ou motivo)." }, { status: 400 });
    }

    const inicio = new Date(`${dataISO}T${hora}:00`);
    if (Number.isNaN(inicio.getTime())) {
      return Response.json({ error: "Data ou hora inválida." }, { status: 400 });
    }
    if (inicio.getTime() < Date.now() - 5 * 60_000) {
      return Response.json({ error: "Esse horário já passou — escolha um horário no futuro." }, { status: 400 });
    }
    const fim = new Date(inicio.getTime() + DURACAO_MINUTOS * 60_000);

    const admin = createAdminClient();

    const { data: gc } = await admin.from("gcs").select("nome").eq("id", gcId).maybeSingle();
    if (!gc) return Response.json({ error: "GC não encontrado." }, { status: 400 });

    // resolve empresa vinculada: usa a informada, tenta achar por e-mail/telefone, ou cria nova
    let empresaId = corpo.empresaId ?? null;
    let empresaEncontrada = Boolean(empresaId);

    if (!empresaId) {
      const telefoneE164 = normalizarTelefoneE164(telefone);
      const { data: empresas } = await admin.from("empresas").select("id, telefone, email");
      const match = (empresas ?? []).find((e) => {
        if (e.email && e.email.toLowerCase() === email.toLowerCase()) return true;
        if (telefoneE164 && e.telefone) {
          const normalizado = normalizarTelefoneE164(e.telefone);
          return normalizado && normalizado.slice(-8) === telefoneE164.slice(-8);
        }
        return false;
      });

      if (match) {
        empresaId = match.id;
        empresaEncontrada = true;
      } else if (corpo.criarNovaEmpresa) {
        const { data: novaEmpresa, error } = await admin
          .from("empresas")
          .insert({ nome_empresa: nome, nome_contato: nome, email, telefone: telefone ?? null })
          .select("id")
          .single();
        if (!error && novaEmpresa) {
          empresaId = novaEmpresa.id;
          empresaEncontrada = true;
        }
      }
    }

    const tituloEvento = `Reunião com ${nome} — ${motivo}`;
    const resultadoCalendario = await criarEventoReuniao({
      gcId,
      titulo: tituloEvento,
      descricao: motivo,
      participantesEmails: email ? [email] : undefined,
      inicioISO: inicio.toISOString(),
      fimISO: fim.toISOString(),
    });

    const dataHoraFormatada = inicio.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });

    const resultadoEmail = resultadoCalendario.ok
      ? await enviarEmail({
          para: [email],
          assunto: `Reunião confirmada · ${dataHoraFormatada}`,
          html: montarEmailConfirmacaoReuniao({
            nomeEmpresa: nome,
            dataHora: dataHoraFormatada,
            linkChamada: resultadoCalendario.linkChamada ?? null,
            nomeGc: gc.nome,
          }),
        })
      : { ok: false, error: "Não enviado — a reunião não foi criada no Calendar." };

    const textoWhatsapp = `Olá, ${nome}! Sua reunião com ${gc.nome} (ADM Soluções) foi confirmada para ${dataHoraFormatada}.${
      resultadoCalendario.linkChamada ? `\nLink da chamada: ${resultadoCalendario.linkChamada}` : ""
    }\nMotivo: ${motivo}`;

    const resultadoWhatsapp = await enviarWhatsappGenerico(telefone, empresaId, { modo: "texto", texto: textoWhatsapp });

    // cria atividade só se a reunião ficou vinculada a uma empresa do CRM
    let atividadeId: string | null = null;
    if (empresaId) {
      const { data: atividade } = await admin
        .from("atividades")
        .insert({
          empresa_id: empresaId,
          tipo_atividade: `Reunião: ${motivo}`,
          responsavel_id: gcId,
          status: "Pendente",
          prazo: dataISO,
          alerta_disparado: false,
        })
        .select("id")
        .single();
      atividadeId = atividade?.id ?? null;
    }

    // memória de contatos (upsert por e-mail)
    const { data: contatoExistente } = await admin
      .from("acao_rapida_contatos")
      .select("id, quantidade_usos")
      .ilike("email", email)
      .maybeSingle();

    let contatoId: string;
    if (contatoExistente) {
      contatoId = contatoExistente.id;
      await admin
        .from("acao_rapida_contatos")
        .update({
          nome,
          telefone: telefone ?? undefined,
          empresa_id: empresaId,
          ultima_vez_usado: new Date().toISOString(),
          quantidade_usos: contatoExistente.quantidade_usos + 1,
        })
        .eq("id", contatoId);
    } else {
      const { data: novoContato } = await admin
        .from("acao_rapida_contatos")
        .insert({ nome, email, telefone, empresa_id: empresaId })
        .select("id")
        .single();
      contatoId = novoContato?.id ?? "";
    }

    // memória de motivos recentes (upsert por texto, case-insensitive)
    const { data: motivoExistente } = await admin
      .from("acao_rapida_motivos_recentes")
      .select("id, quantidade_usos")
      .ilike("motivo", motivo)
      .maybeSingle();
    if (motivoExistente) {
      await admin
        .from("acao_rapida_motivos_recentes")
        .update({ quantidade_usos: motivoExistente.quantidade_usos + 1, ultima_vez_usado: new Date().toISOString() })
        .eq("id", motivoExistente.id);
    } else {
      await admin.from("acao_rapida_motivos_recentes").insert({ motivo });
    }

    await Promise.all([
      registrarLog(admin, {
        contatoId: contatoId || null,
        empresaId,
        atividadeId,
        canal: "calendario",
        resultado: { ok: resultadoCalendario.ok, erro: resultadoCalendario.error },
      }),
      registrarLog(admin, {
        contatoId: contatoId || null,
        empresaId,
        atividadeId,
        canal: "email",
        resultado: { ok: resultadoEmail.ok, erro: resultadoEmail.error },
      }),
      registrarLog(admin, { contatoId: contatoId || null, empresaId, atividadeId, canal: "whatsapp", resultado: resultadoWhatsapp }),
    ]);

    return Response.json({
      calendario: { ok: resultadoCalendario.ok, erro: resultadoCalendario.error },
      email: { ok: resultadoEmail.ok, erro: resultadoEmail.error },
      whatsapp: resultadoWhatsapp,
      linkChamada: resultadoCalendario.linkChamada ?? null,
      empresaEncontrada,
      empresaId,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}
