/** Cliente da API v5 da Casa dos Dados (busca de empresas por CNPJ/filtros).
 * Doc oficial: https://docs.casadosdados.com.br — cada resultado consome
 * saldo da conta, então nunca chame isso a partir do client.
 *
 * Usamos o fluxo de "gerar arquivo" (POST /v5/cnpj/pesquisa/arquivo + polling
 * em /v4/.../arquivo/{uuid} até sair o link + download do CSV) em vez do
 * endpoint síncrono de pesquisa, porque o síncrono não devolve telefone/
 * e-mail/atividade — confirmado comparando com uma planilha real exportada
 * pelo portal deles, que tem essas colunas. */

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

export interface EmpresaImportada {
  cnpj: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
}

function apiKeyObrigatoria(): string {
  const apiKey = process.env.CASA_DOS_DADOS_API_KEY;
  if (!apiKey) throw new Error("CASA_DOS_DADOS_API_KEY não configurada.");
  return apiKey;
}

async function solicitarArquivo(filtros: FiltrosBuscaEmpresas, limite: number): Promise<string> {
  const resposta = await fetch(`${HOST}/v5/cnpj/pesquisa/arquivo`, {
    method: "POST",
    headers: { "api-key": apiKeyObrigatoria(), "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "csv",
      total_linhas: Math.min(Math.max(limite, 1), 1000),
      pesquisa: filtros,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Casa dos Dados (gerar arquivo) respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = (await resposta.json()) as { arquivo_uuid?: string };
  if (!dados.arquivo_uuid) throw new Error("Casa dos Dados não retornou o id do arquivo gerado.");
  return dados.arquivo_uuid;
}

/** O arquivo é gerado de forma assíncrona — fica tentando por até ~50s. */
async function aguardarLinkDoArquivo(uuid: string): Promise<string> {
  const apiKey = apiKeyObrigatoria();
  for (let tentativa = 0; tentativa < 17; tentativa++) {
    const resposta = await fetch(`${HOST}/v4/public/cnpj/pesquisa/arquivo/${uuid}`, {
      headers: { "api-key": apiKey },
    });
    if (resposta.status === 200) {
      const dados = (await resposta.json()) as { link?: string };
      if (dados.link) return dados.link;
    } else if (resposta.status !== 202) {
      const corpo = await resposta.text();
      throw new Error(`Casa dos Dados (status do arquivo) respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("O arquivo da Casa dos Dados demorou demais pra ficar pronto. Tente novamente em instantes.");
}

/** Parser de CSV simples que respeita aspas (campos podem ter vírgula dentro). */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        dentroDeAspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\r") {
      // ignora, o \n cuida da quebra de linha
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.length > 1 || l[0] !== "");
}

function decodificarCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // O export da Casa dos Dados às vezes vem em Windows-1252 (acentos quebram em UTF-8 estrito).
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function primeiroValor(campo: string | undefined): string | null {
  if (!campo) return null;
  const valor = campo.split(",")[0].trim();
  return valor || null;
}

async function baixarEParsearCsv(link: string): Promise<EmpresaImportada[]> {
  const resposta = await fetch(link);
  if (!resposta.ok) throw new Error(`Falha ao baixar o arquivo gerado (status ${resposta.status}).`);

  const texto = decodificarCsv(await resposta.arrayBuffer());
  const linhas = parseCsv(texto);
  if (linhas.length < 1) return [];

  const cabecalho = linhas[0].map((c) => c.trim().toLowerCase());
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iCnpj = idx("cnpj");
  const iRazao = idx("razao social");
  const iFantasia = idx("nome fantasia");
  const iMunicipio = idx("municipio");
  const iUf = idx("uf");
  const iTelefones = idx("telefones");
  const iEmail = idx("e-mail");
  const iAtividade = idx("descricao da atividade principal");

  return linhas
    .slice(1)
    .filter((l) => l[iCnpj])
    .map((l) => ({
      cnpj: l[iCnpj],
      nome: (iFantasia >= 0 && l[iFantasia]?.trim()) || l[iRazao] || "Sem nome",
      cidade: iMunicipio >= 0 ? l[iMunicipio] || null : null,
      estado: iUf >= 0 ? l[iUf] || null : null,
      telefone: iTelefones >= 0 ? primeiroValor(l[iTelefones]) : null,
      email: iEmail >= 0 ? primeiroValor(l[iEmail]) : null,
      segmento: iAtividade >= 0 ? l[iAtividade] || null : null,
    }));
}

export async function buscarEmpresasCasaDosDados(
  filtros: FiltrosBuscaEmpresas,
  limite: number
): Promise<EmpresaImportada[]> {
  const uuid = await solicitarArquivo(filtros, limite);
  const link = await aguardarLinkDoArquivo(uuid);
  return baixarEParsearCsv(link);
}
