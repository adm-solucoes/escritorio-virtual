import { createClient } from "@supabase/supabase-js";
import { criarNotificacaoSeNaoExiste } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/**
 * Webhook do agente de voz outbound (projeto separado, `agente-voz-outbound/`).
 * Recebe o resultado de UMA ligação já encerrada e:
 *
 *  1. registra uma atividade concluída (auditoria — a ligação aconteceu, aqui
 *     está o resumo);
 *  2. se `trigger_whatsapp_followup` vier true, cria uma SUGESTÃO pendente na
 *     mesma fila que a automação de IA já usa (`automacao_sugestoes_ia`) e
 *     notifica o GC responsável — igual a qualquer outra automação do CRM,
 *     mensagem pro cliente NUNCA sai sozinha, precisa de aprovação manual em
 *     /automacoes/sugestoes.
 *
 * `call_id` é a chave de idempotência: se o agente de voz reenviar (retry),
 * a segunda chamada não duplica nada.
 */

function apenasDigitos(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(request: Request) {
  const chave = request.headers.get("x-api-key");
  if (!chave || chave !== process.env.AGENTE_VOZ_WEBHOOK_SECRET) {
    return Response.json({ error: "Chave de API ausente ou inválida (header x-api-key)" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisição inválido (esperado JSON)" }, { status: 400 });
  }

  const callId = texto(body.call_id);
  const telefone = texto(body.telefone);
  if (!callId || !telefone) {
    return Response.json({ error: "call_id e telefone são obrigatórios" }, { status: 400 });
  }

  const interessado = body.interessado === true;
  const motivoRecusa = texto(body.motivo_recusa);
  const melhorHorario = texto(body.melhor_horario_retorno);
  const resumo = texto(body.resumo) ?? "(sem resumo)";
  const dispararWhatsapp = body.trigger_whatsapp_followup === true;
  const templateWhatsapp = texto(body.whatsapp_template);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  // Idempotência: o call_id vai embutido no texto da atividade (sem migração
  // nova só pra isto). Se já existe, essa chamada é um reenvio — não duplica.
  const marcaIdempotencia = `[agente-voz:${callId}]`;
  const { data: jaProcessado } = await supabase
    .from("atividades")
    .select("id")
    .ilike("tipo_atividade", `%${marcaIdempotencia}%`)
    .maybeSingle();
  if (jaProcessado) {
    return Response.json({ ok: true, duplicado: true });
  }

  // Casa por telefone comparando só dígitos, pelos últimos 8 (DDD + prefixo
  // variam de formatação entre o que o agente de voz discou e o que está
  // cadastrado). Heurística, não é garantia — empresas tem mais de um
  // telefone às vezes, separados por "/", e o find já cobre isso.
  const digitosChamada = apenasDigitos(telefone);
  const sufixo = digitosChamada.slice(-8);
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nome_empresa, gc_responsavel_id, telefone");
  const empresa = (empresas ?? []).find((e) => sufixo && apenasDigitos(e.telefone).includes(sufixo));

  const tipoAtividade = `Ligação (agente de voz) ${marcaIdempotencia}: ${resumo}`;
  await supabase.from("atividades").insert({
    empresa_id: empresa?.id ?? null,
    tipo_atividade: tipoAtividade,
    status: "Concluído",
    prazo: new Date().toISOString().slice(0, 10),
    responsavel_id: empresa?.gc_responsavel_id ?? null,
  });

  let sugestaoId: string | null = null;

  if (dispararWhatsapp) {
    const conteudo = [
      `Ligação de prospecção concluída${empresa ? ` com ${empresa.nome_empresa}` : ` (telefone ${telefone}, sem empresa correspondente no CRM)`}.`,
      "",
      `Resumo: ${resumo}`,
      interessado ? "Lead demonstrou interesse." : `Sem interesse no momento${motivoRecusa ? ` — ${motivoRecusa}` : "."}`,
      melhorHorario ? `Melhor horário sugerido pra retorno: ${melhorHorario}` : null,
      templateWhatsapp ? `Template sugerido: ${templateWhatsapp}` : null,
      "",
      "[Rascunho gerado a partir do agente de voz — revise antes de enviar]",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: sugestao, error: erroSugestao } = await supabase
      .from("automacao_sugestoes_ia")
      .insert({ empresa_id: empresa?.id ?? null, canal: "whatsapp", conteudo })
      .select("id")
      .single();

    if (erroSugestao) {
      console.error("[agente-voz/resultado] falha ao criar sugestão:", erroSugestao.message);
    } else {
      sugestaoId = sugestao.id;
      const mensagemNotificacao = `WhatsApp de follow-up pós-ligação aguardando aprovação${
        empresa ? ` — ${empresa.nome_empresa}` : ` (tel. ${telefone})`
      }`;

      if (empresa?.gc_responsavel_id) {
        await criarNotificacaoSeNaoExiste(supabase, {
          gcId: empresa.gc_responsavel_id,
          tipo: "sugestao_ia",
          mensagem: mensagemNotificacao,
          linkTipo: "sugestao_ia",
          linkId: sugestaoId,
        });
      } else {
        // Sem GC específico (empresa não encontrada, ou encontrada mas sem
        // responsável definido) — avisa todo mundo com papel de gestor, pra
        // não sumir silenciosamente.
        const { data: gestores } = await supabase.from("gcs").select("id").eq("role", "gestor");
        for (const g of gestores ?? []) {
          await criarNotificacaoSeNaoExiste(supabase, {
            gcId: g.id,
            tipo: "sugestao_ia",
            mensagem: mensagemNotificacao,
            linkTipo: "sugestao_ia",
            linkId: sugestaoId,
          });
        }
      }
    }
  }

  return Response.json({
    ok: true,
    empresaEncontrada: Boolean(empresa),
    empresaId: empresa?.id ?? null,
    sugestaoWhatsappId: sugestaoId,
  });
}
