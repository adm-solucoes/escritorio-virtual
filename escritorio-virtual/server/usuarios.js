// Contas do escritorio, guardadas num JSON no disco (o projeto nao usa banco
// externo). Ver docs/plano-login.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASTA = path.join(__dirname, 'data');
const ARQUIVO = path.join(PASTA, 'usuarios.json');
const ARQUIVO_CONFIG = path.join(PASTA, 'config.json');

const SCRYPT_KEYLEN = 64;

let usuarios = []; // carregado uma vez e mantido em memoria
let segredoSessao = null;

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

// Grava num temporario e renomeia: se cair energia no meio, o arquivo bom continua
// inteiro em vez de virar um JSON pela metade.
function gravarJson(arquivo, dados) {
  garantirPasta();
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function lerJson(arquivo, padrao) {
  try {
    if (!fs.existsSync(arquivo)) return padrao;
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    console.error('[usuarios] nao consegui ler ' + arquivo + ':', e.message);
    return padrao;
  }
}

function carregar() {
  usuarios = lerJson(ARQUIVO, { usuarios: [] }).usuarios || [];

  // Em hospedagem sem disco persistente (Render free), server/data/ some a cada
  // restart. Se o segredo fosse sorteado de novo, todo cookie de sessao virava
  // invalido e todo mundo era deslogado. Por isso SESSION_SECRET vem primeiro.
  const doAmbiente = (process.env.SESSION_SECRET || '').trim();
  if (doAmbiente.length >= 16) {
    segredoSessao = doAmbiente;
    return;
  }

  const config = lerJson(ARQUIVO_CONFIG, null);
  if (config && typeof config.segredoSessao === 'string') {
    segredoSessao = config.segredoSessao;
  } else {
    // Primeira execucao: gera e guarda, pra reiniciar o servidor nao deslogar todo mundo.
    segredoSessao = crypto.randomBytes(32).toString('hex');
    gravarJson(ARQUIVO_CONFIG, { segredoSessao });
  }
}

function salvar() {
  gravarJson(ARQUIVO, { usuarios });
}

function getSegredoSessao() {
  return segredoSessao;
}

// ---------- senha ----------

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, SCRYPT_KEYLEN).toString('hex');
}

function senhaConfere(senha, usuario) {
  const tentativa = Buffer.from(hashSenha(senha, usuario.salt), 'hex');
  const guardado = Buffer.from(usuario.senhaHash, 'hex');
  if (tentativa.length !== guardado.length) return false;
  return crypto.timingSafeEqual(tentativa, guardado);
}

// ---------- consultas ----------

function chaveEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function porEmail(email) {
  const chave = chaveEmail(email);
  return usuarios.find((u) => u.emailChave === chave) || null;
}

function porId(id) {
  return usuarios.find((u) => u.id === id) || null;
}

// O que pode sair do servidor: nunca o hash nem o salt.
function publico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    isAdmin: !!usuario.isAdmin,
    appearance: usuario.appearance || null,
    criadoEm: usuario.criadoEm || null,
  };
}

// ---------- escrita ----------

function criar({ nome, email, senha, isAdmin }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const usuario = {
    id: crypto.randomUUID(),
    nome,
    email: String(email).trim(),
    emailChave: chaveEmail(email),
    salt,
    senhaHash: hashSenha(senha, salt),
    isAdmin: !!isAdmin,
    appearance: null,
    criadoEm: Date.now(),
    ultimoAcesso: Date.now(),
  };
  usuarios.push(usuario);
  salvar();
  return usuario;
}

function marcarAcesso(id) {
  const u = porId(id);
  if (!u) return;
  u.ultimoAcesso = Date.now();
  salvar();
}

function atualizarPerfil(id, { nome, appearance }) {
  const u = porId(id);
  if (!u) return null;
  if (typeof nome === 'string' && nome) u.nome = nome;
  if (appearance) u.appearance = appearance;
  salvar();
  return u;
}

carregar();

module.exports = {
  porEmail,
  porId,
  publico,
  criar,
  senhaConfere,
  marcarAcesso,
  atualizarPerfil,
  getSegredoSessao,
  totalDeContas: () => usuarios.length,
  // copia rasa: quem le a lista nao mexe no estado interno
  todos: () => usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email })),
};
