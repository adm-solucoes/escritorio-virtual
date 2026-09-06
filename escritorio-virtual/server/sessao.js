// Sessao por cookie assinado, sem estado no servidor: o proprio valor carrega o id
// do usuario e a validade, e a assinatura garante que ninguem editou.
// Ver docs/plano-login.md, secao 4.
const crypto = require('crypto');
const usuarios = require('./usuarios');

const NOME_COOKIE = 'adm_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const PRODUCAO = process.env.NODE_ENV === 'production';

function assinar(dados) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao()).update(dados).digest('hex');
}

function criarToken(usuarioId) {
  const corpo = Buffer.from(usuarioId + '.' + (Date.now() + DURACAO_MS)).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

function lerToken(token) {
  if (typeof token !== 'string') return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;

  const corpo = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);
  const esperada = assinar(corpo);
  // Comparacao em tempo constante: nao entrega a assinatura certa byte a byte.
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;

  const [usuarioId, expiraEm] = Buffer.from(corpo, 'base64url').toString('utf8').split('.');
  if (!usuarioId || !expiraEm || Number(expiraEm) < Date.now()) return null;
  return usuarioId;
}

// Parser de cookie pequeno o suficiente pra nao valer uma dependencia nova.
function lerCookies(header) {
  const saida = {};
  String(header || '').split(';').forEach((parte) => {
    const igual = parte.indexOf('=');
    if (igual < 0) return;
    const nome = parte.slice(0, igual).trim();
    if (nome) saida[nome] = decodeURIComponent(parte.slice(igual + 1).trim());
  });
  return saida;
}

function atributosCookie(maxAgeSegundos) {
  const partes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSegundos,
  ];
  // Sem HTTPS o navegador descarta um cookie Secure - por isso so em producao.
  if (PRODUCAO) partes.push('Secure');
  return partes.join('; ');
}

function definirCookie(res, usuarioId) {
  const token = criarToken(usuarioId);
  res.setHeader('Set-Cookie', NOME_COOKIE + '=' + token + '; ' + atributosCookie(DURACAO_MS / 1000));
}

function limparCookie(res) {
  res.setHeader('Set-Cookie', NOME_COOKIE + '=; ' + atributosCookie(0));
}

// Usuario da requisicao HTTP (ou null).
function usuarioDaRequisicao(req) {
  const cookies = lerCookies(req.headers.cookie);
  const id = lerToken(cookies[NOME_COOKIE]);
  return id ? usuarios.porId(id) : null;
}

// Usuario do handshake do socket (mesmo cookie).
function usuarioDoSocket(socket) {
  const cookies = lerCookies(socket.handshake.headers.cookie);
  const id = lerToken(cookies[NOME_COOKIE]);
  return id ? usuarios.porId(id) : null;
}

// Barra a rota pra quem nao esta logado.
function exigirLogin(req, res, next) {
  const usuario = usuarioDaRequisicao(req);
  if (!usuario) return res.status(401).json({ erro: 'Faca login pra continuar.' });
  req.usuario = usuario;
  next();
}

module.exports = {
  definirCookie,
  limparCookie,
  usuarioDaRequisicao,
  usuarioDoSocket,
  exigirLogin,
};
