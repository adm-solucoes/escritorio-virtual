import { createAdminClient } from "@/lib/supabase-admin";
import { chamarClaude } from "@/lib/ai";
import type { Empresa, Gc, Oportunidade } from "@/lib/types";

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
  const { gcId, pergunta } = await request.json();
  if (typeof pergunta !== "string" || !pergunta.trim()) {
    return Response.json({ error: "Pergunta vazia" }, { status: 400 });
  }
  if (typeof gcId !== "string") {
    return Response.json({ error: "Usuário não identificado" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: gcAtual } = await admin.from("gcs").select("*").eq("id", gcId).maybeSingle();
  if (!gcAtual || gcAtual.role === "sem_acesso") {
    return Response.json({ error: "Sem acesso a dados comerciais." }, { status: 403 });
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

  const system = `Você é um assistente comercial interno da ADM Soluções, uma empresa júnior de consultoria. Para perguntas sobre o pipeline, empresas e oportunidades, responda usando SOMENTE os dados fornecidos abaixo — nunca invente números, valores ou etapas que não estão na lista.

Você também tem uma ferramenta de busca na web. Use-a quando o usuário pedir pra pesquisar informações externas sobre uma empresa (notícias recentes, site, LinkedIn, o que a empresa faz) — nesse caso, busque de verdade e cite as fontes. Não use a busca pra perguntas sobre os dados internos do pipeline.

Seja direto e específico — cite nomes de empresas, valores e números reais. Se não tiver a informação (nem nos dados internos nem via busca), diga claramente que não tem. Responda em português, de forma objetiva e curta — no máximo uns 8-10 tópicos ou parágrafos curtos, sem repetir a mesma informação de formas diferentes.

DADOS INTERNOS DO PIPELINE:
${contexto}`;

  const resultado = await chamarClaude({
    tarefa: "redigir",
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
