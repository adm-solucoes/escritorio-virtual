import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";
import { buscarEmpresasCasaDosDados, type FiltrosBuscaEmpresas } from "@/lib/casa-dos-dados";

export const dynamic = "force-dynamic";

interface CorpoRequisicao {
  filtros: FiltrosBuscaEmpresas;
  quantidade: number;
}

/** Importa empresas da Casa dos Dados pra tabela `empresas`, pulando CNPJs
 * que já existem no CRM. Cada linha retornada pela API consome saldo da
 * conta, então limitamos a 1 página (máx. 1000, que já é o teto da API). */
export async function POST(req: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const corpo = (await req.json()) as CorpoRequisicao;
  const quantidade = Math.min(Math.max(Math.trunc(corpo.quantidade || 0), 1), 1000);

  let resultado;
  try {
    resultado = await buscarEmpresasCasaDosDados(corpo.filtros ?? {}, quantidade);
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao consultar a Casa dos Dados." }, { status: 502 });
  }

  const admin = createAdminClient();
  const cnpjsEncontrados = resultado.cnpjs.map((e) => e.cnpj).filter(Boolean);

  const { data: existentes } = await admin.from("empresas").select("cnpj").in("cnpj", cnpjsEncontrados);
  const cnpjsJaCadastrados = new Set((existentes ?? []).map((e) => e.cnpj));

  const novas = resultado.cnpjs.filter((e) => e.cnpj && !cnpjsJaCadastrados.has(e.cnpj));

  const linhas = novas.map((e) => ({
    nome_empresa: e.nome_fantasia || e.razao_social || "Sem nome",
    cnpj: e.cnpj,
    cidade: e.endereco?.municipio ?? null,
    estado: e.endereco?.uf ?? null,
    origem_lead: "Casa dos Dados",
  }));

  if (linhas.length > 0) {
    const { error } = await admin.from("empresas").insert(linhas);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    encontradas: resultado.cnpjs.length,
    totalDisponivel: resultado.total,
    importadas: linhas.length,
    duplicadas: resultado.cnpjs.length - linhas.length,
  });
}
