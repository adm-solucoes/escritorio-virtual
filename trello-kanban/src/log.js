/**
 * Log com redação de segredos.
 *
 * O token do Trello e a senha de SMTP viajam em query string / config e é
 * fácil vazarem sem querer num log de erro (a URL completa aparece na
 * mensagem de exceção do fetch, por exemplo). Em vez de confiar em lembrar
 * disso em cada `console.log`, toda saída passa por aqui e é higienizada.
 */

const segredos = new Set();

/** Registra um valor que nunca pode aparecer na saída. */
export function protegerSegredo(valor) {
  if (typeof valor === "string" && valor.length >= 8) segredos.add(valor);
}

/** Troca qualquer segredo conhecido por ***. Também pega token/key em URLs. */
export function limpar(texto) {
  let saida = String(texto);
  for (const s of segredos) {
    saida = saida.split(s).join("***");
  }
  // Rede de segurança: mesmo um segredo não registrado some se vier como
  // parâmetro de URL com nome conhecido.
  return saida.replace(/\b(key|token|password|pass|secret)=([^&\s"']+)/gi, "$1=***");
}

const emoji = { ok: "✓", criado: "+", pulado: "·", aviso: "!", erro: "✗", passo: "▸" };

function escrever(tipo, mensagem) {
  const marca = emoji[tipo] ?? " ";
  const linha = `${marca} ${limpar(mensagem)}`;
  if (tipo === "erro") console.error(linha);
  else console.log(linha);
}

export const log = {
  /** Início de uma etapa (linha em branco antes, pra separar os blocos). */
  passo: (m) => {
    console.log("");
    escrever("passo", m);
  },
  /** Recurso criado agora. */
  criado: (m) => escrever("criado", m),
  /** Já existia — nada foi feito (idempotência funcionando). */
  pulado: (m) => escrever("pulado", m),
  ok: (m) => escrever("ok", m),
  aviso: (m) => escrever("aviso", m),
  erro: (m) => escrever("erro", m),
  /** Texto solto, sem marcador. */
  info: (m) => console.log(limpar(m)),
};
