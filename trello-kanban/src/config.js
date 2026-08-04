import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protegerSegredo } from "./log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(__dirname, "..");

const AREAS_VALIDAS = ["Marketing", "Gente", "Gestão"];
const TIPOS_CONVITE = ["normal", "admin", "observer"];

class ErroDeConfiguracao extends Error {}

function obrigatoria(nome, dica) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new ErroDeConfiguracao(`${nome} não está preenchida no .env.\n   → ${dica}`);
  return valor;
}

/**
 * Lê e valida o members.json.
 *
 * Valida TUDO antes de qualquer chamada de rede, de propósito: é muito pior
 * descobrir um e-mail errado depois de já ter criado o quadro e convidado
 * metade das pessoas do que falhar na largada com a lista de problemas.
 */
function carregarMembros() {
  const caminho = path.join(RAIZ, "members.json");
  if (!existsSync(caminho)) {
    throw new ErroDeConfiguracao(
      "members.json não encontrado.\n" +
        "   → Copie o members.example.json para members.json e preencha com as pessoas de verdade."
    );
  }

  let bruto;
  try {
    bruto = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (err) {
    throw new ErroDeConfiguracao(`members.json não é um JSON válido: ${err.message}`);
  }

  if (!Array.isArray(bruto)) {
    throw new ErroDeConfiguracao('members.json precisa ser uma LISTA: [ { "nome": ..., "email": ..., "area": ... } ]');
  }
  if (bruto.length === 0) {
    throw new ErroDeConfiguracao("members.json está vazio — nenhuma pessoa pra convidar.");
  }

  const problemas = [];
  const emailsVistos = new Map();
  const membros = [];

  bruto.forEach((m, i) => {
    const posicao = `item ${i + 1}`;
    const nome = typeof m?.nome === "string" ? m.nome.trim() : "";
    const email = typeof m?.email === "string" ? m.email.trim().toLowerCase() : "";
    const area = typeof m?.area === "string" ? m.area.trim() : "";

    if (!nome) problemas.push(`${posicao}: falta "nome"`);
    // Validação simples de propósito: e-mail só é validado de verdade quando
    // alguém responde. O objetivo aqui é pegar erro de digitação óbvio.
    if (!email) problemas.push(`${posicao}: falta "email"`);
    else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) problemas.push(`${posicao} (${nome}): e-mail inválido "${email}"`);
    if (!AREAS_VALIDAS.includes(area)) {
      problemas.push(`${posicao} (${nome || email}): área "${area}" inválida — use ${AREAS_VALIDAS.join(", ")}`);
    }

    if (email) {
      if (emailsVistos.has(email)) problemas.push(`${posicao}: e-mail "${email}" repetido (já está no item ${emailsVistos.get(email)})`);
      else emailsVistos.set(email, i + 1);
    }

    membros.push({ nome, email, area });
  });

  if (problemas.length) {
    throw new ErroDeConfiguracao(`members.json tem ${problemas.length} problema(s):\n   - ${problemas.join("\n   - ")}`);
  }

  return membros;
}

function carregarSmtp() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  // SMTP é opcional. Só vale se o conjunto mínimo estiver preenchido — meio
  // preenchido é pior que vazio (falha no meio do envio), então avisamos.
  const preenchidos = [host, user, pass].filter(Boolean).length;
  if (preenchidos === 0) return { ativo: false };
  if (preenchidos < 3) {
    return {
      ativo: false,
      avisoIncompleto: "SMTP_HOST, SMTP_USER e SMTP_PASS precisam estar os três preenchidos. E-mail personalizado será pulado.",
    };
  }

  protegerSegredo(pass);
  return {
    ativo: true,
    host,
    porta: Number(process.env.SMTP_PORT) || 587,
    user,
    pass,
    from,
  };
}

export function carregarConfig() {
  const apiKey = obrigatoria("TRELLO_API_KEY", "Pegue em https://trello.com/app-key (campo 'Key')");
  const token = obrigatoria("TRELLO_TOKEN", "Na mesma página, clique em 'Token', autorize e copie o valor");

  // Registra os segredos antes de qualquer log/erro poder vazá-los.
  protegerSegredo(token);
  protegerSegredo(apiKey);

  const tipoConvite = (process.env.CONVITE_TIPO?.trim() || "normal").toLowerCase();
  if (!TIPOS_CONVITE.includes(tipoConvite)) {
    throw new ErroDeConfiguracao(`CONVITE_TIPO="${tipoConvite}" inválido — use: ${TIPOS_CONVITE.join(", ")}`);
  }

  return {
    trello: { apiKey, token },
    quadroNome: process.env.QUADRO_NOME?.trim() || "Kanban — Marketing · Gente · Gestão",
    workspace: process.env.TRELLO_WORKSPACE?.trim() || null,
    tipoConvite,
    membros: carregarMembros(),
    smtp: carregarSmtp(),
    dryRun: process.argv.includes("--dry-run"),
  };
}

export { ErroDeConfiguracao, AREAS_VALIDAS };
