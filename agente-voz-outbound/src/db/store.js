import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Persistência simples em arquivo JSON — suficiente pro piloto de 50 ligações.
 * Um único arquivo, reescrito inteiro a cada mudança, com uma fila de escrita
 * pra duas ligações terminando ao mesmo tempo não corromperem o arquivo.
 *
 * Quando conectar no CRM de verdade, troque este módulo por um client do
 * banco — a interface (getCall/upsertCall/listCalls) é o contrato a manter.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(__dirname, "..", "..", "data", "calls.json");

let filaOperacoes = Promise.resolve();

async function lerTudo() {
  try {
    const conteudo = await fs.readFile(ARQUIVO, "utf8");
    return JSON.parse(conteudo);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Serializa o ciclo INTEIRO de ler→modificar→escrever, não só a escrita.
 *
 * Bug real que isso corrige: antes, `upsertCall` fazia `await lerTudo()`,
 * modificava e só então enfileirava a escrita. Duas atualizações concorrentes
 * (duas ligações ao mesmo tempo, ou o status callback da Twilio chegando junto
 * com um evento do media-stream) liam a MESMA versão do arquivo e a segunda
 * sobrescrevia a primeira — atualização perdida, em silêncio. A fila antiga
 * só impedia arquivo corrompido, não perda de dado.
 */
function emSerie(operacao) {
  const resultado = filaOperacoes.then(operacao, operacao);
  // A fila nunca pode "quebrar": se uma operação falhar, as próximas
  // continuam rodando normalmente.
  filaOperacoes = resultado.then(
    () => undefined,
    () => undefined
  );
  return resultado;
}

export async function upsertCall(callId, patch) {
  return emSerie(async () => {
    const dados = await lerTudo();
    dados[callId] = { ...(dados[callId] || {}), ...patch, atualizadoEm: new Date().toISOString() };
    await fs.writeFile(ARQUIVO, JSON.stringify(dados, null, 2), "utf8");
    return dados[callId];
  });
}

export async function getCall(callId) {
  const dados = await lerTudo();
  return dados[callId] ?? null;
}

export async function listCalls() {
  const dados = await lerTudo();
  return Object.values(dados);
}
