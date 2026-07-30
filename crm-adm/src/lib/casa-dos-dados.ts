/** Cliente da API v5 da Casa dos Dados (busca de empresas por CNPJ/filtros).
 * Doc oficial: https://docs.casadosdados.com.br — cada resultado consome
 * saldo da conta, então nunca chame isso a partir do client. */

const HOST = "https://api.casadosdados.com.br";

export interface FiltrosBuscaEmpresas {
  uf?: string[];
  municipio?: string[];
  bairro?: string[];
  cep?: string[];
  codigo_atividade_principal?: string[];
  situacao_cadastral?: ("ATIVA" | "BAIXADA" | "INAPTA" | "NULA" | "SUSPENSA")[];
  mais_filtros?: {
    com_email?: boolean;
    com_telefone?: boolean;
    somente_matriz?: boolean;
  };
}

interface CasaDosDadosEndereco {
  cep: string | null;
  uf: string | null;
  municipio: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
}

export interface CasaDosDadosEmpresa {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: { situacao_cadastral: string | null } | null;
  endereco: CasaDosDadosEndereco | null;
  data_abertura: string | null;
}

interface RespostaPesquisa {
  total: number;
  cnpjs: CasaDosDadosEmpresa[];
}

/** Busca até `limite` empresas (máximo 1000 por página, conforme a API) que
 * batem com os filtros. Lança erro se a chave não estiver configurada ou se
 * a API responder com falha, pra nunca importar dado incompleto/errado. */
export async function buscarEmpresasCasaDosDados(
  filtros: FiltrosBuscaEmpresas,
  limite: number,
  pagina = 1
): Promise<RespostaPesquisa> {
  const apiKey = process.env.CASA_DOS_DADOS_API_KEY;
  if (!apiKey) {
    throw new Error("CASA_DOS_DADOS_API_KEY não configurada.");
  }

  // "simples" só traz cnpj/razão social/nome fantasia/situação — sem
  // endereço. Precisamos de "completo" pra preencher cidade/estado.
  const resposta = await fetch(`${HOST}/v5/cnpj/pesquisa?tipo_resultado=completo`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...filtros,
      limite: Math.min(Math.max(limite, 1), 1000),
      pagina,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Casa dos Dados respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  return (await resposta.json()) as RespostaPesquisa;
}
