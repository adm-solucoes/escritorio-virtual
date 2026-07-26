// Parser determinístico (regex, zero IA) do comando da Ação Rápida.
// Formato: "reunião [hora] com [nome] [email] [telefone] [dia opcional]"

export interface ComandoParseado {
  hora: string; // HH:mm
  nome: string;
  email: string | null;
  telefone: string | null;
  dataISO: string; // YYYY-MM-DD
}

export type ResultadoParse = { ok: true; comando: ComandoParseado } | { ok: false; erro: string };

const REGEX_HORA = /(\d{1,2})(?:h(\d{2})?|:(\d{2}))/i;
const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const REGEX_TELEFONE = /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/;
const REGEX_DATA_DDMM = /\b(\d{1,2})\/(\d{1,2})\b/;
const REGEX_AMANHA = /amanh[ãa]/i;
const REGEX_HOJE = /\bhoje\b/i;

function resolverData(trecho: string): string {
  const hoje = new Date();
  if (REGEX_AMANHA.test(trecho)) {
    hoje.setDate(hoje.getDate() + 1);
    return hoje.toISOString().slice(0, 10);
  }
  if (REGEX_HOJE.test(trecho)) {
    return hoje.toISOString().slice(0, 10);
  }
  const m = trecho.match(REGEX_DATA_DDMM);
  if (m) {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    let ano = hoje.getFullYear();
    const inicioHoje = new Date(hoje);
    inicioHoje.setHours(0, 0, 0, 0);
    const candidata = new Date(`${ano}-${mes}-${dia}T00:00:00`);
    if (candidata.getTime() < inicioHoje.getTime()) ano += 1;
    return `${ano}-${mes}-${dia}`;
  }
  return hoje.toISOString().slice(0, 10);
}

export function parseComando(textoOriginal: string): ResultadoParse {
  const texto = textoOriginal.trim();

  if (!/^reuni[aã]o\b/i.test(texto)) {
    return { ok: false, erro: 'O comando precisa começar com "reunião".' };
  }

  const matchHora = texto.match(REGEX_HORA);
  if (!matchHora) {
    return { ok: false, erro: "Não entendi o horário. Use algo como 14h, 14:00 ou 09:30." };
  }
  const hh = matchHora[1].padStart(2, "0");
  const mm = (matchHora[2] ?? matchHora[3] ?? "00").padStart(2, "0");
  if (Number(hh) > 23 || Number(mm) > 59) {
    return { ok: false, erro: "Horário inválido." };
  }
  const hora = `${hh}:${mm}`;

  const indiceComMatch = texto.match(/\bcom\b/i);
  if (!indiceComMatch || indiceComMatch.index === undefined) {
    return { ok: false, erro: 'Não encontrei "com [nome]" no comando.' };
  }
  const restoAposCom = texto.slice(indiceComMatch.index + indiceComMatch[0].length).trim();

  const matchEmail = restoAposCom.match(REGEX_EMAIL);
  const matchTelefone = restoAposCom.match(REGEX_TELEFONE);
  const matchAmanha = restoAposCom.match(REGEX_AMANHA);
  const matchHoje = restoAposCom.match(REGEX_HOJE);
  const matchDataDDMM = restoAposCom.match(REGEX_DATA_DDMM);

  const indicesCorte = [matchEmail?.index, matchTelefone?.index, matchAmanha?.index, matchHoje?.index, matchDataDDMM?.index].filter(
    (i): i is number => typeof i === "number"
  );
  const fimNome = indicesCorte.length > 0 ? Math.min(...indicesCorte) : restoAposCom.length;
  const nome = restoAposCom.slice(0, fimNome).trim().replace(/[,;]+$/, "");

  if (!nome) {
    return { ok: false, erro: "Não entendi o nome do contato." };
  }

  const dataISO = resolverData(restoAposCom);

  return {
    ok: true,
    comando: {
      hora,
      nome,
      email: matchEmail ? matchEmail[0] : null,
      telefone: matchTelefone ? matchTelefone[0].replace(/[^\d+]/g, "") : null,
      dataISO,
    },
  };
}
