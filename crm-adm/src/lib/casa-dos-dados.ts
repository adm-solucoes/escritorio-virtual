import { inflateRawSync } from "node:zlib";

/** Cliente da API v5 da Casa dos Dados (busca de empresas por CNPJ/filtros).
 * Doc oficial: https://docs.casadosdados.com.br — cada resultado consome
 * saldo da conta, então nunca chame isso a partir do client.
 *
 * Usamos o fluxo de "gerar arquivo" (POST /v5/cnpj/pesquisa/arquivo + polling
 * em /v4/.../arquivo/{uuid} até sair o arquivo) em vez do endpoint síncrono
 * de pesquisa, porque o síncrono não devolve telefone/e-mail/atividade —
 * confirmado comparando com uma planilha real exportada pelo portal deles.
 *
 * Na prática a API às vezes devolve o arquivo (xlsx, binário) direto em vez
 * do JSON documentado com {link}, então o código aqui lê a resposta como
 * bytes primeiro e só tenta interpretar como JSON se não parecer um arquivo
 * — em vez de presumir o formato e quebrar com "Unexpected token 'P'". */

const HOST = "https://api.casadosdados.com.br";

export interface FiltrosBuscaEmpresas {
  uf?: string[];
  municipio?: string[];
  bairro?: string[];
  cep?: string[];
  ddd?: string[];
  codigo_atividade_principal?: string[];
  situacao_cadastral?: ("ATIVA" | "BAIXADA" | "INAPTA" | "NULA" | "SUSPENSA")[];
  mais_filtros?: {
    com_email?: boolean;
    com_telefone?: boolean;
    somente_matriz?: boolean;
    excluir_email_contab?: boolean;
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
  contato: string | null;
  cargo: string | null;
}

function apiKeyObrigatoria(): string {
  const apiKey = process.env.CASA_DOS_DADOS_API_KEY;
  if (!apiKey) throw new Error("CASA_DOS_DADOS_API_KEY não configurada.");
  return apiKey;
}

type RespostaFlexivel = { json: Record<string, unknown> } | { bytes: ArrayBuffer };

/** Lê a resposta sem presumir o formato: só interpreta como JSON se os bytes
 * realmente parecerem JSON (não começam com a assinatura de um ZIP/xlsx). */
async function lerRespostaFlexivel(resposta: Response): Promise<RespostaFlexivel> {
  const buffer = await resposta.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const pareceZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!pareceZip) {
    const texto = new TextDecoder("utf-8").decode(buffer).trim();
    if (texto.startsWith("{") || texto.startsWith("[")) {
      try {
        return { json: JSON.parse(texto) };
      } catch {
        // não era JSON de verdade apesar da aparência — trata como arquivo
      }
    }
  }
  return { bytes: buffer };
}

/** Devolve os bytes do arquivo final (xlsx ou csv, tanto faz — detectamos o
 * formato depois), já resolvendo o fluxo de solicitação + espera assíncrona
 * + eventual download por link. */
async function obterArquivoFinal(filtros: FiltrosBuscaEmpresas, limite: number): Promise<ArrayBuffer> {
  const apiKey = apiKeyObrigatoria();

  const respostaCriacao = await fetch(`${HOST}/v5/cnpj/pesquisa/arquivo`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "csv",
      total_linhas: Math.min(Math.max(limite, 1), 1000),
      pesquisa: filtros,
    }),
  });
  if (!respostaCriacao.ok) {
    const corpo = await respostaCriacao.text();
    throw new Error(`Casa dos Dados (gerar arquivo) respondeu ${respostaCriacao.status}: ${corpo.slice(0, 300)}`);
  }

  const criacao = await lerRespostaFlexivel(respostaCriacao);
  if ("bytes" in criacao) return criacao.bytes; // veio pronto na hora

  const uuid = criacao.json.arquivo_uuid as string | undefined;
  if (!uuid) throw new Error("Casa dos Dados não retornou o id do arquivo gerado.");

  for (let tentativa = 0; tentativa < 17; tentativa++) {
    const respostaStatus = await fetch(`${HOST}/v4/public/cnpj/pesquisa/arquivo/${uuid}`, {
      headers: { "api-key": apiKey },
    });

    if (respostaStatus.status === 200) {
      const status = await lerRespostaFlexivel(respostaStatus);
      if ("bytes" in status) return status.bytes; // arquivo veio direto
      const link = status.json.link as string | undefined;
      if (link) {
        const respostaArquivo = await fetch(link);
        if (!respostaArquivo.ok) throw new Error(`Falha ao baixar o arquivo gerado (status ${respostaArquivo.status}).`);
        return respostaArquivo.arrayBuffer();
      }
      // JSON sem link ainda — provavelmente "processando", continua tentando
    } else if (respostaStatus.status !== 202) {
      const corpo = await respostaStatus.text();
      throw new Error(`Casa dos Dados (status do arquivo) respondeu ${respostaStatus.status}: ${corpo.slice(0, 300)}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("O arquivo da Casa dos Dados demorou demais pra ficar pronto. Tente novamente em instantes.");
}

/** Parser de CSV simples que respeita aspas (campos podem ter o delimitador
 * dentro). Detecta ";" vs "," olhando a primeira linha — CSV brasileiro
 * geralmente usa ";" porque "," é separador decimal. */
function detectarDelimitador(texto: string): string {
  const primeiraLinha = texto.slice(0, texto.indexOf("\n") > -1 ? texto.indexOf("\n") : texto.length);
  const pontoEVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  const virgula = (primeiraLinha.match(/,/g) ?? []).length;
  return pontoEVirgula > virgula ? ";" : ",";
}

function parseCsv(texto: string): string[][] {
  const delimitador = detectarDelimitador(texto);
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
    } else if (c === delimitador) {
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

function decodificarTexto(bytes: ArrayBuffer | Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // O export da Casa dos Dados às vezes vem em Windows-1252 (acentos quebram em UTF-8 estrito).
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ---- Leitor mínimo de .xlsx (é um .zip com XML dentro) ----

function colunaParaIndice(letras: string): number {
  let indice = 0;
  for (const ch of letras) indice = indice * 26 + (ch.charCodeAt(0) - 64);
  return indice - 1;
}

function lerEntradasZip(buffer: Buffer): Map<string, Buffer> {
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Arquivo ZIP/xlsx inválido (fim do diretório central não encontrado).");

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdCount = buffer.readUInt16LE(eocdOffset + 10);
  const entradas = new Map<string, Buffer>();
  let offset = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compMetodo = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nome = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);

    if (buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataInicio = localOffset + 30 + lhNameLen + lhExtraLen;
      const dados = buffer.subarray(dataInicio, dataInicio + compSize);
      entradas.set(nome, compMetodo === 8 ? inflateRawSync(dados) : Buffer.from(dados));
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entradas;
}

/** O zip pode ser um .xlsx de verdade (estrutura xl/worksheets/...) ou só um
 * .csv compactado (o que a API devolve quando pedimos tipo "csv") — tenta os
 * dois formatos antes de desistir. */
function lerArquivoZip(buffer: ArrayBuffer): string[][] {
  const entradas = lerEntradasZip(Buffer.from(buffer));

  const nomeAba = Array.from(entradas.keys()).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (nomeAba) return lerPlanilhaXlsx(entradas, nomeAba);

  const nomeCsv = Array.from(entradas.keys()).find((n) => /\.(csv|txt)$/i.test(n));
  if (nomeCsv) return parseCsv(decodificarTexto(entradas.get(nomeCsv)!));

  throw new Error(
    `Arquivo da Casa dos Dados veio num formato zip inesperado (conteúdo: ${Array.from(entradas.keys()).join(", ")}).`
  );
}

function lerPlanilhaXlsx(entradas: Map<string, Buffer>, nomeAba: string): string[][] {
  let sharedStrings: string[] = [];
  const sharedStringsBuf = entradas.get("xl/sharedStrings.xml");
  if (sharedStringsBuf) {
    const xml = sharedStringsBuf.toString("utf8");
    sharedStrings = Array.from(xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)).map((m) => {
      const textos = Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((t) => t[1]);
      return textos.join("");
    });
  }

  const xmlAba = entradas.get(nomeAba)!.toString("utf8");

  const linhasXml = xmlAba.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
  const linhas: string[][] = [];

  for (const linhaXml of linhasXml) {
    const linha: string[] = [];
    const celulas = Array.from(linhaXml.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([a-zA-Z]+)")?[^>]*>([\s\S]*?)<\/c>/g));
    for (const [, colLetra, tipo, conteudo] of celulas) {
      let valor = "";
      if (tipo === "inlineStr") {
        valor = Array.from(conteudo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
          .map((m) => m[1])
          .join("");
      } else if (tipo === "s") {
        const vMatch = conteudo.match(/<v>([\s\S]*?)<\/v>/);
        valor = vMatch ? sharedStrings[Number(vMatch[1])] ?? "" : "";
      } else {
        const vMatch = conteudo.match(/<v>([\s\S]*?)<\/v>/);
        valor = vMatch ? vMatch[1] : "";
      }
      const idx = colunaParaIndice(colLetra);
      linha[idx] = valor
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
    }
    linhas.push(linha.map((v) => v ?? ""));
  }

  return linhas;
}

function extrairLinhas(bytes: ArrayBuffer): string[][] {
  const primeiros2 = new Uint8Array(bytes.slice(0, 2));
  const ehZip = primeiros2[0] === 0x50 && primeiros2[1] === 0x4b; // "PK"
  return ehZip ? lerArquivoZip(bytes) : parseCsv(decodificarTexto(bytes));
}

function primeiroValor(campo: string | undefined): string | null {
  if (!campo) return null;
  const valor = campo.split(",")[0].trim();
  return valor || null;
}

/** A coluna "Telefones" pode trazer mais de um número separado por vírgula.
 * Se filtramos por DDD específico, prefere o número que realmente bate com
 * esse DDD (a empresa pode ter outros telefones registrados de outra praça). */
function escolherTelefone(campo: string | undefined, ddds: string[] | undefined): string | null {
  if (!campo) return null;
  const numeros = campo.split(",").map((n) => n.trim()).filter(Boolean);
  if (ddds && ddds.length > 0) {
    const encontrado = numeros.find((n) => ddds.some((ddd) => n.replace(/\D/g, "").startsWith(ddd)));
    if (encontrado) return encontrado;
  }
  return numeros[0] || null;
}

/** Extrai nome e cargo do primeiro sócio listado na coluna "Socios", que vem
 * no formato "Qualificação - NOME [, Qualificação - NOME2, ...]". */
function primeiroSocio(campo: string | undefined): { nome: string | null; cargo: string | null } {
  if (!campo) return { nome: null, cargo: null };
  const primeiro = campo.split(",")[0].trim();
  const partes = primeiro.split(" - ");
  if (partes.length >= 2) {
    return { cargo: partes[0].trim() || null, nome: partes.slice(1).join(" - ").trim() || null };
  }
  return { nome: primeiro || null, cargo: null };
}

export async function buscarEmpresasCasaDosDados(
  filtros: FiltrosBuscaEmpresas,
  limite: number
): Promise<EmpresaImportada[]> {
  const bytes = await obterArquivoFinal(filtros, limite);
  const linhas = extrairLinhas(bytes);
  if (linhas.length < 1) return [];

  const cabecalho = linhas[0].map((c) => (c ?? "").trim().toLowerCase());
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iCnpj = idx("cnpj");
  const iRazao = idx("razao social");
  const iFantasia = idx("nome fantasia");
  const iMunicipio = idx("municipio");
  const iUf = idx("uf");
  const iTelefones = idx("telefones");
  const iEmail = idx("e-mail");
  const iAtividade = idx("descricao da atividade principal");
  const iSocios = idx("socios");

  if (iCnpj < 0) {
    throw new Error(`Arquivo da Casa dos Dados veio num formato inesperado (colunas: ${cabecalho.join(", ")}).`);
  }

  return linhas
    .slice(1)
    .filter((l) => l[iCnpj])
    .map((l) => {
      const socio = iSocios >= 0 ? primeiroSocio(l[iSocios]) : { nome: null, cargo: null };
      return {
        cnpj: l[iCnpj],
        nome: (iFantasia >= 0 && l[iFantasia]?.trim()) || l[iRazao] || "Sem nome",
        cidade: iMunicipio >= 0 ? l[iMunicipio] || null : null,
        estado: iUf >= 0 ? l[iUf] || null : null,
        telefone: iTelefones >= 0 ? escolherTelefone(l[iTelefones], filtros.ddd) : null,
        email: iEmail >= 0 ? primeiroValor(l[iEmail]) : null,
        segmento: iAtividade >= 0 ? l[iAtividade] || null : null,
        contato: socio.nome,
        cargo: socio.cargo,
      };
    });
}
