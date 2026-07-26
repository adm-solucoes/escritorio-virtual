import { createAdminClient } from "@/lib/supabase-admin";
import { chamarClaude } from "@/lib/ai";
import type { Empresa, Gc, Oportunidade } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const system = `Você é um assistente comercial interno da ADM Soluções, uma empresa júnior de consultoria. Responda a pergunta do usuário usando SOMENTE os dados de empresas e oportunidades fornecidos abaixo. Seja direto e específico — cite nomes de empresas, valores e números reais dos dados. Se a pergunta não puder ser respondida com esses dados, diga claramente que não tem essa informação. Nunca invente dados que não estão na lista. Responda em português, em no máximo 4-5 frases ou uma lista curta.

DADOS:
${contexto}`;

  const resultado = await chamarClaude({
    tarefa: "redigir",
    system,
    mensagem: pergunta,
    maxTokens: 600,
  });

  if (!resultado.ok) {
    return Response.json({ error: resultado.erro }, { status: 200 });
  }

  return Response.json({ resposta: resultado.texto });
}
