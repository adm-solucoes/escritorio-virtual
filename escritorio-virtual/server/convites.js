// Link de convidado: o visitante abre a URL, diz o nome e entra sem criar conta.
// Ver docs/plano-convidado.md.
//
// O token nao guarda estado no servidor - o proprio valor carrega a validade e a
// assinatura garante que ninguem editou. Mesma ideia do cookie de sessao
// (server/sessao.js), e pelo mesmo motivo: nao ha banco, e uma lista de tokens
// emitidos num JSON seria mais uma coisa pra sincronizar e pra crescer sem fim.
const crypto = require('crypto');
const fs = require('fs');
const usuarios = require('./usuarios');
const pastaDados = require('./dados');

const ARQUIVO_CONFIG = pastaDados.arquivo('config.json');
const HORAS_PADRAO = 24;
const MAX_HORAS = 24 * 7;

// A geracao e o unico jeito de revogar um link ja distribuido sem guardar a
// lista de tokens emitidos: o token carrega o numero da geracao em que nasceu e
// para de valer quando o numero muda. Link de convite vaza em grupo de
// WhatsApp, entao esse botao precisa existir.
function lerGeracao() {
  try {
    const config = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
    return Number(config.geracaoConvites) || 1;
  } catch (e) {
    return 1;
  }
}

function gravarGeracao(valor) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8')) || {};
  } catch (e) { /* arquivo ainda nao existe: comeca vazio */ }
  config.geracaoConvites = valor;
  pastaDados.garantirPasta();
  const tmp = ARQUIVO_CONFIG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, ARQUIVO_CONFIG);
}

function assinar(corpo) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao()).update(corpo).digest('hex');
}

// `quemCriou` entra no token pra dar pra saber de quem veio o link depois.
function criar({ quemCriou, horas }) {
  const validade = Math.min(Math.max(Number(horas) || HORAS_PADRAO, 1), MAX_HORAS);
  const expiraEm = Date.now() + validade * 60 * 60 * 1000;
  const corpo = Buffer.from(
    [lerGeracao(), expiraEm, quemCriou || ''].join('.')
  ).toString('base64url');
  return { token: corpo + '.' + assinar(corpo), expiraEm };
}

function ler(token) {
  if (typeof token !== 'string') return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;

  const corpo = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);
  const esperada = assinar(corpo);
  // Comparacao em tempo constante, como em sessao.js: nao entrega a assinatura
  // certa byte a byte pra quem ficar tentando.
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;

  const [geracao, expiraEm, quemCriou] = Buffer.from(corpo, 'base64url').toString('utf8').split('.');
  if (Number(geracao) !== lerGeracao()) return null;   // link revogado em bloco
  if (!expiraEm || Number(expiraEm) < Date.now()) return null;
  return { expiraEm: Number(expiraEm), quemCriou: quemCriou || null };
}

// Mata todos os links ja distribuidos. Devolve a geracao nova.
function revogarTodos() {
  const nova = lerGeracao() + 1;
  gravarGeracao(nova);
  return nova;
}

module.exports = { criar, ler, revogarTodos, HORAS_PADRAO, MAX_HORAS };
