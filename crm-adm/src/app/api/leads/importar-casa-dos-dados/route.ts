import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";
import { buscarEmpresasCasaDosDados, type FiltrosBuscaEmpresas } from "@/lib/casa-dos-dados";

export const dynamic = "force-dynamic";
// O fluxo de geração de arquivo da Casa dos Dados é assíncrono (gera + poll),
// pode passar dos 10s padrão da Vercel.
export const maxDuration = 60;

interface CorpoRequisicao {
  filtros: FiltrosBuscaEmpresas;
  quantidade: number;
}

/** Importa empresas da Casa dos Dados pra tabela `empresas`, pulando CNPJs
 * que já existem no CRM. Cada linha consome saldo da conta, então a
 * quantidade é limitada a 1000 (teto da própria API). */
export async function POST(req: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const corpo = (await req.json()) as CorpoRequisicao;
  const quantidade = Math.min(Math.max(Math.trunc(corpo.quantidade || 0), 1), 1000);

  let encontradas;
  try {
    encontradas = await buscarEmpresasCasaDosDados(corpo.filtros ?? {}, quantidade);
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao consultar a Casa dos Dados." }, { status: 502 });
  }

  const admin = createAdminClient();
  const cnpjsEncontrados = encontradas.map((e) => e.cnpj).filter(Boolean);

  const { data: existentes } = await admin.from("empresas").select("cnpj").in("cnpj", cnpjsEncontrados);
  const cnpjsJaCadastrados = new Set((existentes ?? []).map((e) => e.cnpj));

  const novas = encontradas.filter((e) => e.cnpj && !cnpjsJaCadastrados.has(e.cnpj));

  const linhas = novas.map((e) => ({
    nome_empresa: e.nome,
    cnpj: e.cnpj,
    cidade: e.cidade,
    estado: e.estado,
    telefone: e.telefone,
    email: e.email,
    segmento: e.segmento,
    origem_lead: "Casa dos Dados",
  }));

  if (linhas.length > 0) {
    const { error } = await admin.from("empresas").insert(linhas);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    encontradas: encontradas.length,
    totalDisponivel: encontradas.length,
    importadas: linhas.length,
    duplicadas: encontradas.length - linhas.length,
  });
}
